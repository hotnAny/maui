import OpenAI from "openai";
import { advance, stateConfig } from "@/lib/agent/fsm";
import { loadManifest } from "@/lib/agent/manifest";
import { agentRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";

// R4 — channel split. `ui` triggers arrive canonical and bypass the model entirely.
// `chat` messages get one intent-classification step: bare numbers resolve without a
// model call; anything else is classified against the current state's outgoing intents.

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

  const result = advance(manifest, agent, state, channel, {
    name: resolved.name,
    payload: resolved.payload ?? {},
  });
  if (!result.handled) return Response.json({ handled: false });

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
