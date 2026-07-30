# Compilation rules: agent manifest → runtime

*Maintained doc. Extracted July 30, 2026 from the weight-tracker scratch-pad experiments;
the running example throughout is `agents/weight-tracker/manifest.yaml`. These rules are
AXE-level semantics — they apply to any manifest, not just the weight tracker.*

The compiler consumes two manifest sections and emits two runtime artifacts:

| Source | Target |
|---|---|
| `interaction.fsm` | a **claude-agent-spec**: per-state turn config for the model + a runtime state machine |
| `genui.patterns` | **A2UI JSON** (`createSurface` / `updateComponents` / `updateDataModel`) per state |

## 1. FSM → claude-agent-spec

**R1 — tool inference.** A transition trigger whose canonical name matches a declared tool
compiles to a call of that tool with the trigger's payload: `log_weight(kg)` → `tool
log_weight(kg)`. This is why triggers carry a canonical `name:` alongside the designer's
`desc:` prose — the prose is for the designer, the name is for the compiler. A name that
matches no tool and has no explicit `do:` compiles to a **pure transition** (state/UI change
only — e.g. `open_tracker`). When a transition needs a tool whose name doesn't match, or
more than one call, the designer writes an explicit `do:` line under the transition.

**R2 — per-state agent config.** Each state compiles to the turn config handed to the model
while that state is current:

- *system-prompt fragment*: the state's `desc` + its pattern's `fallback` text;
- *tool allowlist*: only tools inferable (R1) from this state's outgoing transitions
  (weight tracker: s2 exposes `log_weight` only; s1 exposes none — end state);
- *output contract*: only the content blocks the state's pattern permits.

This is what makes the FSM enforcement rather than suggestion: a state cannot call a tool
or render a component its outgoing edges and pattern don't declare.

**R3 — data refresh.** Entering a state re-materializes every path in its pattern's
`binds:` list (weight tracker: `/trend` recomputes after logging). "Update the chart" is
never authored; it falls out of arriving in a state whose pattern binds the path.

**R4 — channel split.** `chat:` triggers compile to one intent-classification step by the
model: it maps a free-text message onto an outgoing canonical name, or `none` → stay in
state and let the model respond normally (the no-trap escape hatch). `ui:` triggers bypass
the model entirely — the A2UI event hits the runtime, which executes R1's tool call and
advances the machine deterministically. **The runtime owns the current state; the model
never does.**

**R5 — end states.** `end: true` means the machine is done for this invocation. The surface
persists (stacked above the prompt textbox; chat stays live); a later chat message starts a
new run at `initial`. Persistence belongs to the surface, not the machine.

## 2. Pattern language → A2UI

Five language rules, total:

- **`Component #id`** — a catalog component plus a stable id. Nesting in `layout:` is
  authoring sugar; the compiler flattens it into A2UI's id-referenced flat component list.
- **`@/path`** — a data binding; compiles to `{"path": "/…"}`. `{@/path}` inside a string
  is interpolation.
- **`?param`** — conditional subtree; emitted or omitted based on the state's pattern call
  (`trend-line-dashboard[input=true]`). One pattern serves multiple states this way.
- **`-> event name`** — an interactive control declares the event it emits; compiles to
  A2UI `"action": {"event": {"name": "…"}}`.
- **`fallback:`** — required; the prose rendering when no A2UI client is present (also the
  accessibility text, and part of the state's prompt fragment per R2).

Catalog note: A2UI catalogs are whitelists. Components outside the standard catalog
(e.g. `LineChart`) must ship in the app's custom catalog, referenced by `genui.catalog`.

### Worked example — `trend-line-dashboard[input=true]` (state s2)

```json
{ "createSurface":   { "surfaceId": "main", "catalogId": "weight-tracker/v1" } }

{ "updateComponents": { "surfaceId": "main", "components": [
  { "id": "root",  "component": "Card",        "child": "col" },
  { "id": "col",   "component": "Column",      "children": ["title", "trend", "delta", "entry"] },
  { "id": "title", "component": "Text",        "text": "past 7 days" },
  { "id": "trend", "component": "LineChart",   "points": { "path": "/trend/points" } },
  { "id": "delta", "component": "Text",        "text": "7-day change: {/trend/delta_kg} kg" },
  { "id": "entry", "component": "Row",         "children": ["kg", "log"] },
  { "id": "kg",    "component": "NumberField", "value": { "path": "/entry/kg" }, "label": "kg" },
  { "id": "log",   "component": "Button",      "text": "Log",
    "action": { "event": { "name": "log_weight" } } }
] } }

{ "updateDataModel": { "surfaceId": "main", "path": "/trend",
  "value": { "points": [ { "date": "2026-07-24", "kg": 68.1 } ],
             "delta_kg": -0.4 } } }
```

`input=false` just omits `entry`/`kg`/`log` and drops `entry` from `col.children` — the
`?input` flag is the entire diff between s1's and s2's UI. When the user presses Log, the
client sends back event `log_weight` with the data model (`kg` from `/entry/kg`); that
event *is* the s2→s1 transition trigger (R4). Exact prop names (`text`/`points`/`value`)
should be re-checked against the A2UI v0.9.1 component gallery and our custom catalog
definition before wiring.

## 3. Static checks (compile-time validation)

The FSM and pattern sections are checkable against each other. The compiler should reject a
manifest when:

1. a state's `ui:` names a pattern id (or param) that doesn't exist;
2. a `ui:` transition trigger has no matching `events:` entry in the current state's
   pattern — a transition no control can fire;
3. a pattern's `events:` entry names no transition out of any state that renders it — a
   control that leads nowhere (dead affordance);
4. a `chat:`/`ui:` trigger name matches no tool and no `do:` and is not plausibly pure —
  warn, don't reject (the designer may intend a pure transition);
5. a pattern `binds:` a path absent from the manifest's `data:` section;
6. an `end: true` state has outgoing transitions (contradiction), or a non-end state has
   none (trap).

## Open items

- `do:` syntax is specified only by example; pin it down when a transition first needs it.
- R4's intent classification needs an eval: a misclassified intent surfaces as a wrong
  transition; repair for that is undo + re-classify, not more states.
- Compile target for the v0 runtime: XState for the machine; per-state config assembled in
  `app/api/chat/route.ts`, which currently forwards only `output_text.delta` and needs the
  block vocabulary wired (triage note, actionable 2).
