import { beforeEach, describe, expect, it, vi } from "vitest";
import { interpolate, resolvePath, setPath } from "./a2ui";
import { advance, outgoing, stateConfig } from "./fsm";
import { loadManifest, parsePatternCall, transitionsOf } from "./manifest";
import { compileLayout, compileSurface, eventBindings } from "./pattern-compiler";

vi.mock("./tools", () => ({
  hasTool: (agent: string, name: string) => name === "log_weight",
  runTool: vi.fn(() => ({ ok: true })),
  materializeData: () => ({
    trend: { points: [{ date: "2026-07-24", kg: 68.1 }, { date: "2026-07-30", kg: 67.65 }], delta_kg: -0.45, latest_kg: 67.65 },
    entry: { kg: null },
  }),
}));

const manifest = loadManifest("weight-tracker");
const pattern = manifest.genui.patterns[0];

describe("manifest", () => {
  it("parses pattern calls and transitions", () => {
    expect(parsePatternCall("trend-line-dashboard[input=false]")).toEqual({
      patternId: "trend-line-dashboard",
      params: { input: false },
    });
    const transitions = transitionsOf(manifest);
    expect(transitions).toHaveLength(4); // s0->s1 chat, s0->s2 chat, s2->s1 ui + chat
    expect(transitions.find((t) => t.from === "s2" && t.channel === "ui")?.name).toBe("log_weight");
  });
});

describe("pattern compiler", () => {
  it("flattens layout into an id-referenced component list (input=true)", () => {
    const components = compileLayout(pattern, { input: true });
    const byId = Object.fromEntries(components.map((component) => [component.id, component]));
    expect(byId.root.component).toBe("Card");
    expect(byId.root.child).toBe("column-1");
    expect(byId["column-1"].children).toEqual(["title", "trend", "delta", "entry"]);
    expect(byId.trend).toMatchObject({ component: "LineChart", points: { path: "/trend/points" } });
    expect(byId.delta.text).toBe("7-day change: {/trend/delta_kg} kg");
    expect(byId.kg).toMatchObject({ component: "NumberField", value: { path: "/entry/kg" }, label: "kg" });
    expect(byId.log).toMatchObject({ text: "Log", action: { event: { name: "log_weight" } } });
  });

  it("prunes the ?input subtree when input=false", () => {
    const components = compileLayout(pattern, { input: false });
    const ids = components.map((component) => component.id);
    expect(ids).not.toContain("entry");
    expect(ids).not.toContain("kg");
    expect(ids).not.toContain("log");
    expect(components.find((component) => component.id === "column-1")?.children).toEqual([
      "title", "trend", "delta",
    ]);
  });

  it("extracts event payload bindings", () => {
    expect(eventBindings(pattern)).toEqual({ log_weight: { kg: "/entry/kg" } });
  });

  it("emits createSurface with the custom catalog", () => {
    const surface = compileSurface(manifest, "trend-line-dashboard[input=true]", "main", {});
    expect(surface.messages[0]).toEqual({ createSurface: { surfaceId: "main", catalogId: "weight-tracker/v1" } });
  });
});

describe("fsm (R1-R5)", () => {
  it("s0 --chat log_weight--> s1 runs the tool and ends (R1, R5)", () => {
    const result = advance(manifest, "weight-tracker", null, "chat", { name: "log_weight", payload: { kg: 67.65 } });
    expect(result).toMatchObject({ handled: true, state: "s1", end: true, toolResult: { name: "log_weight", ok: true } });
    if (result.handled) {
      expect(result.text).toBe("past 7 days: -0.45 kg change, latest 67.65 kg");
      expect(result.surface?.messages.length).toBe(3);
    }
  });

  it("s0 --chat open_tracker--> s2 is a pure transition (no tool)", () => {
    const result = advance(manifest, "weight-tracker", null, "chat", { name: "open_tracker", payload: {} });
    expect(result).toMatchObject({ handled: true, state: "s2", end: false, toolResult: null });
  });

  it("s2 --ui log_weight--> s1 (R4 ui channel, deterministic)", () => {
    const result = advance(manifest, "weight-tracker", "s2", "ui", { name: "log_weight", payload: { kg: 67.5 } });
    expect(result).toMatchObject({ handled: true, state: "s1", end: true });
  });

  it("rejects triggers with no matching outgoing transition", () => {
    expect(advance(manifest, "weight-tracker", "s1", "chat", { name: "open_tracker", payload: {} })).toEqual({ handled: false });
    expect(advance(manifest, "weight-tracker", "s0", "ui", { name: "log_weight", payload: {} })).toEqual({ handled: false });
  });

  it("stateConfig exposes the per-state tool allowlist (R2)", () => {
    expect(stateConfig(manifest, "s2").toolAllowlist).toEqual(["log_weight"]);
    expect(stateConfig(manifest, "s1").toolAllowlist).toEqual([]);
    expect(outgoing(manifest, "s1")).toHaveLength(0);
  });
});

describe("data model helpers", () => {
  let model: Record<string, unknown>;
  beforeEach(() => { model = { trend: { delta_kg: -0.45 } }; });

  it("resolves, sets, and interpolates slash paths", () => {
    expect(resolvePath(model, "/trend/delta_kg")).toBe(-0.45);
    setPath(model, "/entry/kg", 67.5);
    expect(resolvePath(model, "/entry/kg")).toBe(67.5);
    expect(interpolate("change: {/trend/delta_kg} kg, missing: {/nope}", model)).toBe("change: -0.45 kg, missing: —");
  });
});
