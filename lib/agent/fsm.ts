import { interpolate, setPath } from "./a2ui";
import type { Channel, Manifest, Transition } from "./manifest";
import { parsePatternCall, patternOf, transitionsOf } from "./manifest";
import type { CompiledSurface } from "./pattern-compiler";
import { compileSurface } from "./pattern-compiler";
import { hasTool, materializeData, runTool } from "./tools";

// The machine interpreter (compile rules R1, R3, R5). The runtime owns the current
// state; the model never does (R4 — the chat-side classification lives in the API route).

export type AdvanceResult =
  | { handled: false }
  | {
      handled: true;
      state: string;
      end: boolean;
      /** compiled A2UI surface for the new state, if its pattern declares one */
      surface: CompiledSurface | null;
      /** deterministic text response: the pattern fallback, interpolated (R2) */
      text: string;
      toolResult: { name: string; ok: boolean } | null;
    };

export function outgoing(manifest: Manifest, state: string, channel?: Channel): Transition[] {
  return transitionsOf(manifest).filter(
    (transition) => transition.from === state && (!channel || transition.channel === channel),
  );
}

/**
 * R3 — a trigger payload lands in the data model at the destination pattern's bound path
 * whose last segment matches the arg name (`suggested_kg` -> `/check/suggested_kg`). This
 * is how a verdict's suggestion, or a typed weight, reaches the surface that shows it.
 */
function applyPayload(
  manifest: Manifest,
  dataModel: Record<string, unknown>,
  ui: string | undefined,
  payload: Record<string, unknown>,
) {
  if (!ui) return;
  const binds = patternOf(manifest, parsePatternCall(ui).patternId).binds;
  for (const [key, value] of Object.entries(payload)) {
    const path = binds.find((candidate) => candidate.split("/").pop() === key);
    if (path) setPath(dataModel, path, value);
  }
}

export function advance(
  manifest: Manifest,
  agentId: string,
  currentState: string | null,
  channel: Channel,
  trigger: { name: string; payload: Record<string, unknown> },
): AdvanceResult {
  const from = currentState ?? manifest.interaction.fsm.initial;
  const transition = outgoing(manifest, from, channel).find((candidate) => candidate.name === trigger.name);
  if (!transition) return { handled: false };

  // R1 — the edge's tool-use half: its `do:`, or the call inferred from the trigger name.
  // An edge with no effects is a pure transition (state/UI change only).
  let toolResult: { name: string; ok: boolean } | null = null;
  for (const effect of transition.effects) {
    if (!manifest.tools.some((tool) => tool.name === effect.name)) {
      throw new Error(`Transition ${transition.from} -> ${transition.to} does undeclared tool ${effect.name}`);
    }
    if (!hasTool(agentId, effect.name)) continue;
    toolResult = { name: effect.name, ok: runTool(agentId, effect.name, trigger.payload).ok };
    if (!toolResult.ok) break; // a failed call stops the rest of the edge's work
  }

  // R3 — entering a state re-materializes every bound data path.
  const dataModel = materializeData(agentId);
  const stateDef = manifest.interaction.fsm.states[transition.to];
  if (!stateDef) throw new Error(`Transition to unknown state: ${transition.to}`);
  applyPayload(manifest, dataModel, stateDef.ui, trigger.payload);

  let surface: CompiledSurface | null = null;
  let text = "";
  if (stateDef.ui) {
    surface = compileSurface(manifest, parsePatternCall(stateDef.ui), "main", dataModel);
    text = interpolate(surface.fallback, dataModel);
  }
  if (toolResult && !toolResult.ok) {
    text = `Could not run ${toolResult.name} with that input. ${text}`.trim();
  }

  return {
    handled: true,
    state: transition.to,
    end: Boolean(stateDef.end), // R5 — surface persists; a later chat msg starts a new run
    surface,
    text,
    toolResult,
  };
}

/** R2 — the per-state agent config handed to the model for chat-intent classification. */
export function stateConfig(manifest: Manifest, state: string | null) {
  const current = state ?? manifest.interaction.fsm.initial;
  const stateDef = manifest.interaction.fsm.states[current];
  const chatTransitions = outgoing(manifest, current, "chat");
  return {
    state: current,
    instructions: `You are the ${manifest.agent.id} agent. Purpose: ${manifest.agent.purpose}. ` +
      `Current interaction state: ${stateDef?.desc ?? current}.`,
    toolAllowlist: [
      ...new Set(
        chatTransitions
          .flatMap((transition) => transition.effects.map((effect) => effect.name))
          .filter((name) => manifest.tools.some((tool) => tool.name === name)),
      ),
    ],
    intents: chatTransitions.map((transition) => ({
      name: transition.name,
      args: transition.args,
      desc: transition.desc ?? "",
    })),
  };
}

/**
 * R4 — the `agent:` channel. A state with outgoing agent edges is waiting on the model's
 * own verdict rather than on the user: the same classification step as chat, but over what
 * the agent knows instead of over a message. `fallback` is the verdict taken when no model
 * is available or the answer doesn't parse, so a judging state can never trap the machine.
 */
export function judgmentConfig(manifest: Manifest, state: string, context: Record<string, unknown>) {
  const stateDef = manifest.interaction.fsm.states[state];
  const verdicts = outgoing(manifest, state, "agent");
  return {
    state,
    instructions: `You are the ${manifest.agent.id} agent. Purpose: ${manifest.agent.purpose}. ` +
      `You are ${stateDef?.desc ?? state}. Decide which verdict fits, given: ${JSON.stringify(context)}.`,
    verdicts: verdicts.map((transition) => ({
      name: transition.name,
      args: transition.args,
      desc: transition.desc ?? "",
    })),
    fallback: verdicts.find((transition) => transition.default)?.name ?? null,
  };
}

/** Whether the runtime, not the user, owes the machine its next move. */
export function needsJudgment(manifest: Manifest, state: string) {
  return outgoing(manifest, state, "agent").length > 0;
}
