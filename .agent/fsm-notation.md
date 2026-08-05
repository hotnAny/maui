# FSM notation: what a node and an edge may contain

*Maintained doc. Formalized August 5, 2026 from the notation the weight tracker was already
written in. This doc is the **authoring surface** — the shapes a designer writes. What the
compiler does with them is `.agent/compilation-rules.md` (rules R1–R7); the running example
is `agents/weight-tracker/manifest.yaml`.*

The interaction model is a flat state machine under `interaction.fsm`. Two object kinds:

| | carries | in one line |
|---|---|---|
| **node** (state) | `desc`, `ui: pattern[ui-state]`, `end` | what the agent is showing and listening for |
| **edge** (transition) | a trigger (`chat:` / `ui:` user input, or the agent's own `agent:` verdict), plus tool use (`do:`) | what happened, and what the agent runs because of it |

An edge is deliberately *two-sided*. The trigger half is usually the user's; the tool half
is the agent's. Keeping them in separate slots is what makes an edge readable without cross-
referencing the `tools:` section, and what lets a trigger and a tool have different names.

```yaml
interaction:
  fsm:
    initial: s0                      # N1
    states:
      s2:
        desc: dashboard with a weight input field   # N2
        ui: trend-line-dashboard[with-input]        # N3
    transitions:
      s2 -> s4:                                     # N5
        ui:   { desc: presses Log, name: log_weight(kg) }            # N6, ui channel
        chat: { desc: types a weight number, name: log_weight(kg) }  # N6, chat channel
        do: none                                                     # N7
```

## Nodes

**N1 — a machine has one `initial:` state.** Every run starts there; `end: true` states
return to it on the next invocation (compilation rule R5).

**N2 — `desc:` is required, and names a *mode*, not an utterance.** It is prose for the
designer and a fragment of the state's system prompt (R2), so it should read as a
description of what the agent is doing ("dashboard with a weight input field"), not as a
line of dialogue. States are modes: an agent needs a handful, not one per thing the user
might say. Inside a state the model keeps full freedom over wording; the machine governs
only which UI is live, which inputs are listened for, and which tools may fire.

**N3 — `ui:` binds one pattern in one of its declared UI states**, written
`pattern-id[ui-state]`. The bracket names a *rendering variation* of the pattern, not a set
of flags. A pattern that declares no variations is bound without a bracket
(`ui: trend-line-dashboard`). A state with no `ui:` renders nothing new — the previous
surface stands.

**N4 — `end: true` marks the machine done for this invocation.** An end state has no
outgoing edges. The surface persists; the machine does not.

### UI states belong to the pattern

The variations are declared once, by the pattern, and the layout tags the lines that belong
to each:

```yaml
genui:
  patterns:
    - id: trend-line-dashboard
      states: [trend-only, with-input]   # the full set of renderings
      layout: |
        Card #root:
          Column:
            Text #title: "past 7 days"
            LineChart #trend: points=@/trend/points
            ?with-input Row #entry:      # emitted only in the with-input rendering
              NumberField #kg: value=@/entry/kg, label="kg"
```

- an untagged line is in every variation;
- `?name` includes the line (and its subtree) in that variation only;
- `?a|b` includes it in several;
- a `?name` the pattern doesn't declare is a compile error, as is a `pattern[state]` binding
  naming an undeclared variation.

This is the whole reason to name variations rather than pass booleans: the set of things a
pattern can look like is finite, written down, and checkable against the states that bind
it. `params: { input: bool }` implied 2ⁿ renderings of which only some were meaningful.

## Edges

**N5 — an edge is keyed `from -> to`.** Two states, one direction, one entry. Both channels
of the same move share the entry — they are the same edge reached two ways. When two
*different* moves connect the same pair (accepting a correction and rejecting it both land
in "logged"), the key takes a list:

```yaml
  s3 -> s1:
    - ui: { desc: takes the suggested correction, name: accept_suggestion(kg) }
      do: log_weight(kg)
    - ui: { desc: keeps the value as entered, name: confirm_as_entered(kg) }
      do: log_weight(kg)
```

**N6 — the trigger half: `chat:`, `ui:`, and/or `agent:`, at least one.** Each carries a
canonical `name:` with its payload keys (`log_weight(kg)`) and a `desc:`. The three are the
channel split of R4: `chat:` names an *intent* the model classifies a free-text message
onto; `ui:` names an *event* an A2UI control emits, which reaches the runtime already
canonical and never touches the model; `agent:` names a *verdict* the agent reaches about
what it already knows, with no user act at all.

`desc:` is the actor's move in plain words, present tense — "types a weight number",
"presses Log", "the value looks off for a body weight". It is what the generated diagram
shows on the edge (R7) and what the classifier reads, so it earns its keep twice; the
`name:` is for the compiler. Every channel wants one, `ui:` included: an event name is not
a description of pressing a button. (YAML gotcha: inside a `{ … }` flow mapping any comma
ends the value, so a `desc:` with a comma — or a multi-argument `name:` like
`suspect(suggested_kg, message)` — must be quoted.)

### The `agent:` channel

A state whose outgoing edges are `agent:` is not waiting on the user; it is waiting on the
agent's own reasoning. Its edges are the verdicts available, and the runtime asks the model
to pick exactly one — the same classification step `chat:` gets, run over what the agent
knows instead of over a message:

```yaml
  s4:
    desc: judging whether the entered weight is plausible   # no ui: the surface stands
  s4 -> s1:
    agent: { desc: the value looks plausible, name: plausible, default: true }
    do: log_weight(kg)
  s4 -> s3:
    agent: { desc: the value looks off for a body weight, name: "suspect(suggested_kg, message)" }
    do: none
```

This is how an agent-side judgment becomes part of the interaction model instead of hiding
inside a tool or a prompt. Three consequences worth stating:

- **it covers every channel into it.** Routing both the typed weight and the Log button
  through the judging state is what makes the check unskippable; a check done during chat
  intent classification would miss the button entirely, since `ui:` events never reach the
  model.
- **`default: true` marks the verdict taken when no verdict is produced** — no model
  available, or an unparseable answer. Exactly one per state. A judging state is transient,
  so without a default it could strand the machine; this is the same no-trap principle as
  R4's `none` classification for chat. **Pick the cautious branch.** The default is what the
  machine does when the agent cannot think, so it must be the verdict that is safe while
  uninformed — here, *asking* rather than *writing*. Marking `plausible` as the default
  instead made the whole check disappear the moment a model call failed: the value went
  straight to the tool, which refused it, and the user got a rejection where they expected a
  question. The diagram marks the default edge for exactly this reason.
- **it is runtime-internal.** A client can only send `chat` or `ui`; `agent` is absent from
  the request schema on purpose. The runtime resolves the verdict in the same request that
  entered the state, so a judging state is never left standing between turns.

Determinism rule: `(from, channel, name)` must be unique. Two edges leaving one state on
the same channel and name would make the next state ambiguous — which is why the two
buttons in N5's list emit different names rather than the same one with different payloads.

**N7 — the agent-tool-use half: `do:`.** One of:

| written | means |
|---|---|
| `do: log_weight(kg)` | run that tool with the trigger's payload |
| `do: [check_goal, log_weight(kg)]` | run both, in order; a failure stops the rest |
| `do: none` | pure transition — state and UI change, nothing runs |
| *omitted* | infer: if the input's canonical name matches a declared tool, call it; otherwise pure |

`do:` names must resolve in `tools:`. Inference (the omitted case) is R1 and stays for
terseness, but writing `do:` explicitly is preferred on any edge where the reader would
otherwise have to check `tools:` to know whether anything happens — `do: none` says "pure
transition" out loud.

## What a node and an edge deliberately do *not* carry

- **wording** — no `say:` templates; tone stays the model's (`fallback:` on the pattern is
  the no-A2UI rendering, not a script);
- **cross-cutting policy** — clarification limits, progress display, confirmation style are
  machine-level, not per-node; the earlier sketch in `agents/weight-tracker/recycle.md`
  had a `policies:` block for this and it is still unbuilt;
- **an escape hatch per state** — unrecognized chat input is not a modeled edge. It leaves
  the machine where it is and lets the model answer normally, inside the current state's UI
  contract (R4's `none` classification). Anything else would make every state a trap.

## Open items

- The determinism rule (N6) and the FSM/pattern cross-checks in compilation-rules §4 are
  specified but unimplemented; only the UI-state checks (N3/N4) and `do:`-resolves-to-a-tool
  are enforced today, at compile and advance time respectively.
- Multi-call `do:` lists parse and run, but nothing yet passes *different* payloads to the
  second call — every effect on an edge gets the trigger payload.
- Flat only: no nested or parallel regions. A long agent run concurrent with user chat is
  the case that would force statecharts.
