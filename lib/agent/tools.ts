import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Tool implementations and data materialization (compile rule R3), per agent. The
// platform half is the registry shape; the weight-tracker half is the only entry so far.

type WeightEntry = { date: string; kg: number; at: string };
type WeightStore = { entries: WeightEntry[] };

function storePath(agentId: string) {
  return join(process.cwd(), ".data", `${agentId}.json`);
}

function readStore(agentId: string): WeightStore {
  try {
    return JSON.parse(readFileSync(storePath(agentId), "utf8")) as WeightStore;
  } catch {
    return { entries: [] };
  }
}

function writeStore(agentId: string, store: WeightStore) {
  mkdirSync(join(process.cwd(), ".data"), { recursive: true });
  writeFileSync(storePath(agentId), JSON.stringify(store, null, 2));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function trend(agentId: string) {
  const { entries } = readStore(agentId);
  const byDate = new Map<string, WeightEntry>();
  for (const entry of entries) byDate.set(entry.date, entry); // last log of a day wins
  const points: { date: string; kg: number }[] = [];
  for (let daysAgo = 6; daysAgo >= 0; daysAgo -= 1) {
    const date = isoDate(new Date(Date.now() - daysAgo * 86_400_000));
    const entry = byDate.get(date);
    if (entry) points.push({ date, kg: entry.kg });
  }
  const delta = points.length >= 2 ? points[points.length - 1].kg - points[0].kg : 0;
  return { points, delta_kg: Math.round(delta * 100) / 100 };
}

const toolImplementations: Record<string, Record<string, (payload: Record<string, unknown>) => { ok: boolean }>> = {
  "weight-tracker": {
    log_weight(payload) {
      const kg = Number(payload.kg);
      // validity only — plausibility is the machine's job now (s4 judges, s3 asks), so a
      // value the user was asked about and confirmed must still be writable
      if (!Number.isFinite(kg) || kg <= 0) return { ok: false };
      const store = readStore("weight-tracker");
      store.entries.push({ date: isoDate(new Date()), kg, at: new Date().toISOString() });
      writeStore("weight-tracker", store);
      return { ok: true };
    },
  },
};

export function hasTool(agentId: string, name: string) {
  return Boolean(toolImplementations[agentId]?.[name]);
}

export function runTool(agentId: string, name: string, payload: Record<string, unknown>) {
  const tool = toolImplementations[agentId]?.[name];
  if (!tool) throw new Error(`Unknown tool ${name} for agent ${agentId}`);
  return tool(payload);
}

/** R3 — re-materialize the data model paths the agent's patterns bind. */
export function materializeData(agentId: string): Record<string, unknown> {
  if (agentId === "weight-tracker") {
    const { points, delta_kg } = trend(agentId);
    return {
      trend: {
        points,
        delta_kg,
        latest_kg: points.length ? points[points.length - 1].kg : null,
      },
      entry: { kg: null },
      // filled in from a verdict's payload when the agent questions a value (R3)
      check: { message: null, suggested_kg: null },
    };
  }
  return {};
}
