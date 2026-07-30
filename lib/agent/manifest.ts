import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const triggerSchema = z.object({ desc: z.string().optional(), name: z.string() });

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
      transitions: z.record(z.string(), z.partialRecord(z.enum(["chat", "ui"]), triggerSchema)),
    }),
  }),
  genui: z.object({
    catalog: z.string(),
    patterns: z.array(
      z.object({
        id: z.string(),
        desc: z.string(),
        params: z.record(z.string(), z.string()).default({}),
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

/** `trend-line-dashboard[input=false]` -> pattern id + param values */
export type PatternCall = { patternId: string; params: Record<string, boolean | string> };

/** One edge of the machine, normalized from the `s0 -> s1` transition table. */
export type Transition = {
  from: string;
  to: string;
  channel: "chat" | "ui";
  /** canonical trigger base name, e.g. `log_weight` from `log_weight(kg)` */
  name: string;
  /** declared payload keys, e.g. `["kg"]` */
  args: string[];
  desc?: string;
};

export function parsePatternCall(call: string): PatternCall {
  const match = call.match(/^([\w-]+)(?:\[(.*)\])?$/);
  if (!match) throw new Error(`Unparseable pattern call: ${call}`);
  const params: Record<string, boolean | string> = {};
  for (const pair of (match[2] ?? "").split(",").filter(Boolean)) {
    const [key, raw] = pair.split("=").map((part) => part.trim());
    params[key] = raw === "true" ? true : raw === "false" ? false : raw;
  }
  return { patternId: match[1], params };
}

export function parseTriggerName(name: string): { name: string; args: string[] } {
  const match = name.match(/^(\w+)(?:\((.*)\))?$/);
  if (!match) throw new Error(`Unparseable trigger name: ${name}`);
  return { name: match[1], args: (match[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean) };
}

export function transitionsOf(manifest: Manifest): Transition[] {
  const out: Transition[] = [];
  for (const [edge, channels] of Object.entries(manifest.interaction.fsm.transitions)) {
    const [from, to] = edge.split("->").map((s) => s.trim());
    if (!from || !to) throw new Error(`Unparseable transition edge: ${edge}`);
    for (const [channel, trigger] of Object.entries(channels)) {
      out.push({
        from,
        to,
        channel: channel as "chat" | "ui",
        ...parseTriggerName(trigger.name),
        desc: trigger.desc,
      });
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
