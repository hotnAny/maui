import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { interpolate, resolvePath, setPath } from "./a2ui";
import { agentRequestSchema } from "../schemas";
import { advance, judgmentConfig, needsJudgment, outgoing, stateConfig } from "./fsm";
import type { Pattern } from "./manifest";
import { loadManifest, parsePatternCall, transitionsOf } from "./manifest";
import { compileLayout, compileSurface, eventBindings } from "./pattern-compiler";
import { DIAGRAM_LEGEND, GENERATED_HEADER, mermaidOf, renderReadme } from "./readme";

vi.mock("./tools", () => ({
  hasTool: (agent: string, name: string) => name === "log_weight",
  runTool: vi.fn(() => ({ ok: true })),
  materializeData: () => ({
    trend: { points: [{ date: "2026-07-24", kg: 68.1 }, { date: "2026-07-30", kg: 67.65 }], delta_kg: -0.45, latest_kg: 67.65 },
    entry: { kg: null },
    check: { message: null, suggested_kg: null },
  }),
}));

const manifest = loadManifest("weight-tracker");
const pattern = manifest.genui.patterns[0];

describe("manifest", () => {
  it("parses pattern calls and transitions", () => {
    expect(parsePatternCall("trend-line-dashboard[trend-only]")).toEqual({
      patternId: "trend-line-dashboard",
      uiState: "trend-only",
    });
    expect(parsePatternCall("trend-line-dashboard")).toEqual({
      patternId: "trend-line-dashboard",
      uiState: null,
    });
    const transitions = transitionsOf(manifest);
    expect(transitions).toHaveLength(9);
    expect(transitions.find((t) => t.from === "s2" && t.channel === "ui")?.name).toBe("log_weight");
    // two distinct moves between the same pair of states, authored as a list (N5)
    expect(transitions.filter((t) => t.from === "s3" && t.to === "s1").map((t) => t.name)).toEqual([
      "accept_suggestion",
      "confirm_as_entered",
    ]);
  });

  it("resolves the tool-use half of each edge", () => {
    const byEdge = (from: string, to: string, channel: string) =>
      transitionsOf(manifest).find((t) => t.from === from && t.to === to && t.channel === channel);
    // explicit `do:` on the verdict edge that logs
    expect(byEdge("s4", "s1", "agent")?.effects).toEqual([{ name: "log_weight", args: ["kg"] }]);
    // `do: none` is a pure transition — nothing is written before the value is judged
    expect(byEdge("s2", "s4", "ui")?.effects).toEqual([]);
    expect(byEdge("s0", "s2", "chat")?.effects).toEqual([]);
  });
});

describe("pattern compiler", () => {
  it("flattens layout into an id-referenced component list (with-input)", () => {
    const components = compileLayout(pattern, "with-input");
    const byId = Object.fromEntries(components.map((component) => [component.id, component]));
    expect(byId.root.component).toBe("Card");
    expect(byId.root.child).toBe("column-1");
    expect(byId["column-1"].children).toEqual(["title", "trend", "delta", "entry"]);
    expect(byId.trend).toMatchObject({ component: "LineChart", points: { path: "/trend/points" } });
    expect(byId.delta.text).toBe("7-day change: {/trend/delta_kg} kg");
    expect(byId.kg).toMatchObject({ component: "NumberField", value: { path: "/entry/kg" }, label: "kg" });
    expect(byId.log).toMatchObject({ text: "Log", action: { event: { name: "log_weight" } } });
  });

  it("prunes the ?with-input subtree in the trend-only UI state", () => {
    const components = compileLayout(pattern, "trend-only");
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
    const surface = compileSurface(manifest, "trend-line-dashboard[with-input]", "main", {});
    expect(surface.messages[0]).toEqual({ createSurface: { surfaceId: "main", catalogId: "weight-tracker/v1" } });
  });

  it("rejects a UI state the pattern does not declare", () => {
    expect(() => compileLayout(pattern, "with-goal")).toThrow(/no UI state with-goal/);
  });
});

describe("pattern compiler — repeats", () => {
  // The shape every selection task needs: N candidates, one select action per row.
  const candidates: Pattern = {
    id: "candidate-list",
    desc: "pick one of several options",
    states: [],
    binds: ["/venues/candidates"],
    layout: [
      "Card #root:",
      "  Column:",
      '    Text #title: "pick a venue"',
      "    *@/venues/candidates Row #venue:",
      '      Text #name: "{@./name}"',
      '      Button #pick: "Choose" -> event select_venue',
    ].join("\n"),
    events: ["select_venue(id=@./id)"],
    fallback: "candidates available",
  };
  const model = {
    venues: { candidates: [{ id: "v1", name: "the park" }, { id: "v2", name: "the hall" }] },
  };

  it("emits one copy of the subtree per item, with unique ids", () => {
    const components = compileLayout(candidates, null, model);
    const ids = components.map((component) => component.id);
    expect(ids).toEqual(["root", "column-1", "title", "venue-0", "name-0", "pick-0", "venue-1", "name-1", "pick-1"]);
    expect(components.find((component) => component.id === "column-1")?.children).toEqual([
      "title", "venue-0", "venue-1",
    ]);
  });

  it("scopes @./field to the row it was expanded under", () => {
    const byId = Object.fromEntries(compileLayout(candidates, null, model).map((c) => [c.id, c]));
    expect(byId["name-0"].text).toBe("{/venues/candidates/0/name}");
    expect(byId["name-1"].text).toBe("{/venues/candidates/1/name}");
  });

  it("gives each row's control its own payload bindings", () => {
    const byId = Object.fromEntries(compileLayout(candidates, null, model).map((c) => [c.id, c]));
    // every row emits the same event name, so the payload can only differ per component
    expect(byId["pick-0"].action).toEqual({
      event: { name: "select_venue", bindings: { id: "/venues/candidates/0/id" } },
    });
    expect(byId["pick-1"].action?.event.bindings).toEqual({ id: "/venues/candidates/1/id" });
  });

  it("renders nothing for an empty or missing list", () => {
    expect(compileLayout(candidates, null, { venues: { candidates: [] } }).map((c) => c.id)).toEqual([
      "root", "column-1", "title",
    ]);
    expect(compileLayout(candidates, null, {}).map((c) => c.id)).toEqual(["root", "column-1", "title"]);
  });

  it("keeps item-relative bindings out of the surface-level map", () => {
    const surface = compileSurface(
      { ...manifest, genui: { ...manifest.genui, patterns: [candidates] } },
      "candidate-list",
      "main",
      model,
    );
    // `./id` means nothing without a row; the components carry those bindings instead
    expect(surface.eventBindings).toEqual({});
  });
});

describe("fsm (R1-R5)", () => {
  it("s0 --chat log_weight--> s4 logs nothing until the value is judged", () => {
    const result = advance(manifest, "weight-tracker", null, "chat", { name: "log_weight", payload: { kg: 67.65 } });
    expect(result).toMatchObject({ handled: true, state: "s4", end: false, toolResult: null });
  });

  it("s4 --agent plausible--> s1 runs the tool and ends (R1, R5)", () => {
    const result = advance(manifest, "weight-tracker", "s4", "agent", { name: "plausible", payload: { kg: 67.65 } });
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

  it("s2 --ui log_weight--> s4: the button path is judged too (R4)", () => {
    const result = advance(manifest, "weight-tracker", "s2", "ui", { name: "log_weight", payload: { kg: 685 } });
    expect(result).toMatchObject({ handled: true, state: "s4", end: false, toolResult: null });
  });

  it("rejects triggers with no matching outgoing transition", () => {
    expect(advance(manifest, "weight-tracker", "s1", "chat", { name: "open_tracker", payload: {} })).toEqual({ handled: false });
    expect(advance(manifest, "weight-tracker", "s0", "ui", { name: "log_weight", payload: {} })).toEqual({ handled: false });
  });

  it("stateConfig exposes the per-state tool allowlist (R2)", () => {
    // s2's chat edge only routes to the check; nothing it can call writes yet
    expect(stateConfig(manifest, "s2").toolAllowlist).toEqual([]);
    expect(stateConfig(manifest, "s1").toolAllowlist).toEqual([]);
    expect(outgoing(manifest, "s1")).toHaveLength(0);
  });

  it("carries the verdict payload into the surface that shows it (R3)", () => {
    const result = advance(manifest, "weight-tracker", "s4", "agent", {
      name: "suspect",
      payload: { kg: 685, suggested_kg: 68.5, message: "685 kg looks like a decimal slip — did you mean 68.5?" },
    });
    expect(result).toMatchObject({ handled: true, state: "s3", toolResult: null });
    if (result.handled) {
      // payload args land at the bound path whose last segment matches: /check/suggested_kg,
      // /check/message, /entry/kg — which is what the two buttons read
      expect(result.text).toBe("685 kg looks like a decimal slip — did you mean 68.5?");
      const data = result.surface?.messages[2];
      expect(data).toMatchObject({
        updateDataModel: { value: { check: { suggested_kg: 68.5 }, entry: { kg: 685 } } },
      });
    }
  });

  it("agent-channel verdicts are runtime-internal and never user-triggered (R4)", () => {
    const config = judgmentConfig(manifest, "s4", { kg: 685 });
    expect(config.verdicts.map((verdict) => verdict.name)).toEqual(["plausible", "suspect"]);
    expect(config.fallback).toBe("suspect"); // no verdict -> ask, never write blind
    expect(needsJudgment(manifest, "s4")).toBe(true);
    expect(needsJudgment(manifest, "s2")).toBe(false);
    // the client can only send chat/ui; `agent` is not in the request schema
    expect(agentRequestSchema.safeParse({ agent: "weight-tracker", channel: "agent" }).success).toBe(false);
  });
});

describe("readme (R6, R7)", () => {
  it("draws one edge per transition channel, with entry and end markers", () => {
    const diagram = mermaidOf(manifest);
    const structure = diagram
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("%%") && !/^\s*(classDef|')/.test(line) && !line.includes("}}}%%"));
    expect(structure).toEqual([
      "stateDiagram-v2",
      "    direction LR",
      `    state "📍 s0 — initial" as s0`,
      `    state "📍 s1 — dashboard-only<br/>🖥️ trend-line-dashboard[trend-only]" as s1`,
      `    state "📍 s2 — dashboard with a weight input field<br/>🖥️ trend-line-dashboard[with-input]" as s2`,
      `    state "📍 s3 — asking about a value that looks off<br/>🖥️ value-check" as s3`,
      `    state "📍 s4 — judging whether the entered weight is plausible" as s4`,
      "    [*] --> s0",
      "    s0 --> s2: 👨🏻‍💻 chat: asks for the tracker without a number", // no 🧰 — `do: none`
      "    s0 --> s4: 👨🏻‍💻 chat: types a weight number",
      "    s2 --> s4: 👨🏻‍💻 chat: types a weight number", // channel order is canonical (chat,
      "    s2 --> s4: 👨🏻‍💻 ui: presses Log", //              ui), not the manifest's order
      "    s4 --> s1: 🤔 agent: the value looks plausible<br/>🧰 log_weight(kg)",
      "    s4 --> s3: 🤔 agent: the value looks off for a body weight (default)",
      "    s3 --> s4: 👨🏻‍💻 chat: types a different weight",
      "    s3 --> s1: 👨🏻‍💻 ui: takes the suggested correction<br/>🧰 log_weight(kg)",
      "    s3 --> s1: 👨🏻‍💻 ui: keeps the value as entered<br/>🧰 log_weight(kg)",
      "    s1 --> [*]",
      "    class s0 primary", // entry point
      "    class s1 success", // terminal
      "    class s2,s3,s4 neutral",
    ]);
  });

  it("styles the diagram with the Mist palette", () => {
    const diagram = mermaidOf(manifest);
    expect(diagram.startsWith("%%{init: {'theme': 'base'")).toBe(true);
    expect(diagram).toContain("classDef success fill:#d0eadb,stroke:#5a9e7a,color:#374151,stroke-width:1.5px");
    // mermaid's directive sanitizer blanks a fontFamily holding a comma or a hyphen
    expect(diagram.match(/'fontFamily': *'([^']*)'/)?.[1]).toMatch(/^[A-Za-z ]+$/);
  });

  it("renders the manifest with the generated marker and computed cross-references", () => {
    const readme = renderReadme(manifest);
    expect(readme.startsWith(GENERATED_HEADER)).toBe(true);
    expect(readme).toContain("```mermaid");
    expect(readme).toContain(DIAGRAM_LEGEND); // the diagram's icons are decodable
    // R2's allowlist, computed rather than restated: only the states past the check write.
    expect(readme).toContain("| `log_weight` | append a weight entry for today | `kg: number` | `ok: bool` | `s3`, `s4` |");
    expect(readme).toContain("used by: `s1` (`trend-line-dashboard[trend-only]`)");
    // the edge's two halves, side by side
    expect(readme).toContain(
      "| `s0` | chat: `open_tracker` — asks for the tracker without a number | — (pure) | `s2` |",
    );
    // a `|` in manifest prose stays inside its cell
    expect(readme).toContain("number \\| null — most recent logged weight");
  });

  it("matches the committed README (static check 10)", () => {
    const committed = readFileSync(join(process.cwd(), "agents", "weight-tracker", "README.md"), "utf8");
    expect(committed).toBe(renderReadme(manifest));
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
