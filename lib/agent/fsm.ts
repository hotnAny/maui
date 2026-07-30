import { interpolate } from "./a2ui";
import type { Manifest, Transition } from "./manifest";
import { parsePatternCall, transitionsOf } from "./manifest";
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

export function outgoing(manifest: Manifest, state: string, channel?: "chat" | "ui"): Transition[] {
  return transitionsOf(manifest).filter(
    (transition) => transition.from === state && (!channel || transition.channel === channel),
  );
}

export function advance(
  manifest: Manifest,
  agentId: string,
  currentState: string | null,
  channel: "chat" | "ui",
  trigger: { name: string; payload: Record<string, unknown> },
): AdvanceResult {
  const from = currentState ?? manifest.interaction.fsm.initial;
  const transition = outgoing(manifest, from, channel).find((candidate) => candidate.name === trigger.name);
  if (!transition) return { handled: false };

  // R1 — tool inference: a canonical name matching a declared tool compiles to that call.
  // A name matching no tool is a pure transition (state/UI change only).
  let toolResult: { name: string; ok: boolean } | null = null;
  const declared = manifest.tools.some((tool) => tool.name === trigger.name);
  if (declared && hasTool(agentId, trigger.name)) {
    toolResult = { name: trigger.name, ok: runTool(agentId, trigger.name, trigger.payload).ok };
  }

  // R3 — entering a state re-materializes every bound data path.
  const dataModel = materializeData(agentId);
  const stateDef = manifest.interaction.fsm.states[transition.to];
  if (!stateDef) throw new Error(`Transition to unknown state: ${transition.to}`);

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
    toolAllowlist: chatTransitions
      .map((transition) => transition.name)
      .filter((name) => manifest.tools.some((tool) => tool.name === name)),
    intents: chatTransitions.map((transition) => ({
      name: transition.name,
      args: transition.args,
      desc: transition.desc ?? "",
    })),
  };
}
