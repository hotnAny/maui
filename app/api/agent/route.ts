import OpenAI from "openai";
import { advance, judgmentConfig, needsJudgment, stateConfig } from "@/lib/agent/fsm";
import { loadManifest } from "@/lib/agent/manifest";
import { agentRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";

// R4 — channel split. `ui` triggers arrive canonical and bypass the model entirely.
// `chat` messages get one intent-classification step: bare numbers resolve without a
// model call; anything else is classified against the current state's outgoing intents.
// `agent` triggers are the model's own verdict about what it knows, resolved here in the
// same request so a judging state is never left standing.

function heuristicIntent(message: string, intents: { name: string; args: string[] }[]) {
  const trimmed = message.trim();
  if (!trimmed) {
    return intents.find((intent) => intent.args.length === 0) ?? null;
  }
  const number = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:kg)?$/i);
  if (number) {
    const intent = intents.find((candidate) => candidate.args.includes("kg"));
    if (intent) return { ...intent, payload: { kg: Number(number[1]) } };
  }
  return null;
}

async function classifyIntent(
  message: string,
  config: ReturnType<typeof stateConfig>,
): Promise<{ name: string; payload: Record<string, unknown> } | null> {
  if (!process.env.OPENAI_API_KEY || config.intents.length === 0) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
      instructions:
        `${config.instructions}\nClassify the user's message onto one canonical intent, or "none". ` +
        `Intents: ${JSON.stringify(config.intents)}. ` +
        `Reply with JSON only: {"name": "<intent-or-none>", "payload": {<arg>: <value>}}.`,
      input: message,
    });
    const parsed = JSON.parse(response.output_text.trim()) as {
      name?: string;
      payload?: Record<string, unknown>;
    };
    if (!parsed.name || parsed.name === "none") return null;
    if (!config.intents.some((intent) => intent.name === parsed.name)) return null;
    return { name: parsed.name, payload: parsed.payload ?? {} };
  } catch (error) {
    console.error("Intent classification failed", error);
    return null;
  }
}

/**
 * Stand-in for the model's judgment when it is unavailable or unusable, so the check still
 * happens rather than degrading to the default verdict. Weight-specific, like
 * `heuristicIntent` above: a body weight far outside the human range is almost always a
 * misplaced decimal point (685 -> 68.5). Delete once the model call is proven in evals.
 */
function heuristicVerdict(
  config: ReturnType<typeof judgmentConfig>,
  context: Record<string, unknown>,
): { name: string; payload: Record<string, unknown> } | null {
  const kg = Number(context.kg);
  if (!Number.isFinite(kg) || !config.verdicts.some((verdict) => verdict.name === "suspect")) return null;
  if (kg >= 20 && kg <= 300) return { name: "plausible", payload: {} };
  const slip = kg / 10;
  return {
    name: "suspect",
    payload: {
      suggested_kg: slip >= 20 && slip <= 300 ? slip : null,
      message: `${kg} kg looks off for a body weight. Did you mean ${slip} kg?`,
    },
  };
}

async function classifyVerdict(
  config: ReturnType<typeof judgmentConfig>,
  context: Record<string, unknown>,
): Promise<{ name: string; payload: Record<string, unknown> } | null> {
  const fallback =
    heuristicVerdict(config, context) ?? (config.fallback ? { name: config.fallback, payload: {} } : null);
  if (!process.env.OPENAI_API_KEY || config.verdicts.length === 0) return fallback;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
      instructions:
        `${config.instructions}\nPick exactly one verdict. ` +
        `Verdicts: ${JSON.stringify(config.verdicts)}. ` +
        `Reply with JSON only: {"name": "<verdict>", "payload": {<arg>: <value>}}.`,
      input: JSON.stringify(context),
    });
    const parsed = JSON.parse(response.output_text.trim()) as {
      name?: string;
      payload?: Record<string, unknown>;
    };
    if (!parsed.name || !config.verdicts.some((verdict) => verdict.name === parsed.name)) return fallback;
    return { name: parsed.name, payload: parsed.payload ?? {} };
  } catch (error) {
    console.error("Verdict classification failed", error);
    return fallback;
  }
}

export async function POST(request: Request) {
  const parsed = agentRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid agent request." }, { status: 400 });
  }
  const { agent, state, channel, trigger, message } = parsed.data;

  let manifest;
  try {
    manifest = loadManifest(agent);
  } catch {
    return Response.json({ error: `Unknown agent: ${agent}` }, { status: 404 });
  }

  let resolved = trigger ?? null;
  if (channel === "chat" && !resolved) {
    if (message === undefined) {
      return Response.json({ error: "Chat requests need a message." }, { status: 400 });
    }
    const config = stateConfig(manifest, state);
    const heuristic = heuristicIntent(message, config.intents);
    resolved = heuristic
      ? { name: heuristic.name, payload: "payload" in heuristic ? (heuristic.payload as Record<string, unknown>) : {} }
      : await classifyIntent(message, config);
  }
  if (!resolved) return Response.json({ handled: false });

  // Payload accumulates across hops: the weight the user entered has to still be there
  // when a verdict adds a suggested correction to it.
  let payload: Record<string, unknown> = resolved.payload ?? {};
  let result = advance(manifest, agent, state, channel, { name: resolved.name, payload });
  if (!result.handled) return Response.json({ handled: false });

  for (let hop = 0; result.handled && needsJudgment(manifest, result.state) && hop < 3; hop += 1) {
    const verdict = await classifyVerdict(judgmentConfig(manifest, result.state, payload), payload);
    if (!verdict) break;
    payload = { ...payload, ...verdict.payload };
    const next = advance(manifest, agent, result.state, "agent", { name: verdict.name, payload });
    if (!next.handled) break;
    result = next;
  }

  return Response.json({
    handled: true,
    state: result.state,
    end: result.end,
    text: result.text,
    a2ui: result.surface?.messages ?? [],
    eventBindings: result.surface?.eventBindings ?? {},
    toolResult: result.toolResult,
  });
}
