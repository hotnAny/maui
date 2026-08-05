import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const triggerSchema = z.object({
  desc: z.string().optional(),
  name: z.string(),
  /** `agent:` only — the verdict the runtime takes when the model produces none */
  default: z.boolean().optional(),
});

// An edge carries both halves: what fires it (`chat:` / `ui:` user input, or the agent's own
// `agent:` verdict) and the tool use it performs (`do:`). See .agent/fsm-notation.md.
const edgeSchema = z.object({
  chat: triggerSchema.optional(),
  ui: triggerSchema.optional(),
  agent: triggerSchema.optional(),
  do: z.union([z.string(), z.array(z.string())]).optional(),
});

export const CHANNELS = ["chat", "ui", "agent"] as const;
export type Channel = (typeof CHANNELS)[number];

const manifestSchema = z.object({
  agent: z.object({ id: z.string(), purpose: z.string(), invocation: z.string() }),
  tools: z.array(
    z.object({
      name: z.string(),
      desc: z.string(),
      input: z.record(z.string(), z.string()),
      output: z.record(z.string(), z.string()),
    }),
  ),
  data: z.record(z.string(), z.string()),
  interaction: z.object({
    fsm: z.object({
      initial: z.string(),
      states: z.record(
        z.string(),
        z.object({ desc: z.string(), ui: z.string().optional(), end: z.boolean().optional() }),
      ),
      // a list when two distinct moves connect the same pair of states (N5)
      transitions: z.record(z.string(), z.union([edgeSchema, z.array(edgeSchema)])),
    }),
  }),
  genui: z.object({
    catalog: z.string(),
    patterns: z.array(
      z.object({
        id: z.string(),
        desc: z.string(),
        /** named renderings of this pattern; empty means the pattern has a single one */
        states: z.array(z.string()).default([]),
        binds: z.array(z.string()),
        layout: z.string(),
        events: z.array(z.string()),
        fallback: z.string(),
      }),
    ),
  }),
});

export type Manifest = z.infer<typeof manifestSchema>;
export type Pattern = Manifest["genui"]["patterns"][number];

/** `trend-line-dashboard[with-input]` -> pattern id + the UI state it binds */
export type PatternCall = { patternId: string; uiState: string | null };

/** A tool call an edge performs, e.g. `log_weight(kg)`. */
export type Effect = { name: string; args: string[] };

/** One edge of the machine, normalized from the `s0 -> s1` transition table. */
export type Transition = {
  from: string;
  to: string;
  channel: Channel;
  /** canonical trigger base name, e.g. `log_weight` from `log_weight(kg)` */
  name: string;
  /** declared payload keys, e.g. `["kg"]` */
  args: string[];
  desc?: string;
  /** the edge's `do:`, or what R1 infers from the trigger name; empty = pure transition */
  effects: Effect[];
  /** `agent:` only — taken when the model produces no verdict */
  default?: boolean;
};

export function parsePatternCall(call: string): PatternCall {
  const match = call.match(/^([\w-]+)(?:\[([\w-]*)\])?$/);
  if (!match) throw new Error(`Unparseable pattern call: ${call}`);
  return { patternId: match[1], uiState: match[2] || null };
}

export function parseTriggerName(name: string): { name: string; args: string[] } {
  const match = name.match(/^(\w+)(?:\((.*)\))?$/);
  if (!match) throw new Error(`Unparseable trigger name: ${name}`);
  return { name: match[1], args: (match[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean) };
}

/**
 * The tool-use half of an edge: an explicit `do:` (`none` = pure transition), or R1's
 * inference from the trigger name when `do:` is omitted.
 */
function effectsOf(manifest: Manifest, declared: string | string[] | undefined, trigger: Effect): Effect[] {
  if (declared === undefined) {
    return manifest.tools.some((tool) => tool.name === trigger.name) ? [trigger] : [];
  }
  const entries = typeof declared === "string" ? [declared] : declared;
  return entries.filter((entry) => entry.trim() !== "none").map(parseTriggerName);
}

export function transitionsOf(manifest: Manifest): Transition[] {
  const out: Transition[] = [];
  for (const [edge, spec] of Object.entries(manifest.interaction.fsm.transitions)) {
    const [from, to] = edge.split("->").map((s) => s.trim());
    if (!from || !to) throw new Error(`Unparseable transition edge: ${edge}`);
    for (const move of Array.isArray(spec) ? spec : [spec]) {
      for (const channel of CHANNELS) {
        const trigger = move[channel];
        if (!trigger) continue;
        const input = parseTriggerName(trigger.name);
        out.push({
          from,
          to,
          channel,
          ...input,
          desc: trigger.desc,
          effects: effectsOf(manifest, move.do, input),
          ...(trigger.default ? { default: true } : {}),
        });
      }
    }
  }
  return out;
}

export function patternOf(manifest: Manifest, patternId: string): Pattern {
  const pattern = manifest.genui.patterns.find((candidate) => candidate.id === patternId);
  if (!pattern) throw new Error(`Unknown pattern: ${patternId}`);
  return pattern;
}

const cache = new Map<string, Manifest>();

export function loadManifest(agentId: string): Manifest {
  const cached = cache.get(agentId);
  if (cached) return cached;
  if (!/^[\w-]+$/.test(agentId)) throw new Error(`Invalid agent id: ${agentId}`);
  const raw = readFileSync(join(process.cwd(), "agents", agentId, "manifest.yaml"), "utf8");
  const manifest = manifestSchema.parse(parse(raw));
  cache.set(agentId, manifest);
  return manifest;
}
