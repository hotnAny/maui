
tasks
- log weight:
    - input: eg: 67.65
    - output: 
        - status (success or not)
        - ui: weight trend in the past week
- view weight trend

## interaction FSM — textual authoring sketch (July 30, 2026)

How to author the interaction model as an FSM, in text, with each state binding a
designer-specified **UI pattern**. Three candidate notations, the pick, then the weight
tracker actually written in it.

### candidates

1. **Mermaid `stateDiagram` + annotations.** Renders as a diagram in markdown for free, but
   has nowhere to put UI patterns except comments, and is not machine-readable enough to
   compile. Good as a *generated view*, wrong as the source of truth.
2. **A compact custom DSL** (`state idle / on log_weight -> logging`). Most readable, but a
   new dialect plus a parser to maintain, and the survey's lesson was to adopt conventional
   shapes rather than invent syntax.
3. **YAML statechart** (XState-shaped). Same language as every other manifest section,
   compiles to a proven runtime (XState), and the Mermaid diagram can be generated *from*
   it for visual review.

Pick: **3**, with the diagram as derived artifact, not source.

### rules that keep the FSM from becoming a script

The triage note's objection to FSMs ("policy, not graph") becomes four design constraints:

- **States are modes, not utterances.** The weight tracker needs ~6 states, not 60. Inside
  a state the model retains full freedom over wording and reasoning; the FSM only governs
  which UI pattern is live, which intents are listened for, and which tools may fire.
- **One intent vocabulary for prose and pixels.** A transition fires on an *intent*. Whether
  the user typed "actually it was 67.5" or pressed the `fix_last` control, the same
  `correct_entry` intent arrives. The C2 `emits:` declarations are exactly the FSM's event
  alphabet — that is what integrates GenUI into the representation.
- **Policies are machine-level invariants, not extra states.** Clarification limits,
  progress display, confirmation style live in a `policies:` block that holds everywhere;
  states only override. This is where the "constraints and invariants" half of the triage
  note's argument lands.
- **No undrawn-path traps.** `unknown_intent: model_handles_in_state` is the escape hatch:
  anything the designer didn't anticipate degrades to normal model behavior *within the
  current state's UI contract*, instead of a dead end.

### the weight tracker, authored

```yaml
machine: weight-tracker
initial: idle

policies:                          # invariants; every state, unless overridden
  clarification: { max_questions_per_turn: 1, on_no_answer: abstain }
  progress: { threshold: 3s, style: step_labels }
  unknown_intent: model_handles_in_state

ui_patterns:                       # C2 templates; states bind these by id
  trend_panel:
    component: line_chart
    surface: canvas
    lifecycle: singleton_panel     # replaces itself, never stacks
    data_contract: { points: [{date, kg}], goal_kg? }
    generate: [insight_text]       # the only model-authored slot
    controls:
      - date_range: { emits: change_range(from, to) }
      - fix_last:   { emits: correct_entry }
    fallback_text: "Logged {kg} kg. 7-day change: {delta} kg."
  value_form:
    component: quick_form
    surface: chat_inline
    fields: [kg]
    emits: log_weight(kg)
    fallback_text: "What was the reading, in kg?"
  confirm_card:
    component: inline_card
    surface: chat_inline
    emits: [confirm, cancel]

states:
  idle:
    ui: trend_panel
    on:
      log_weight(kg): logging
      log_weight(kg missing): clarify_value
      view_trend(range?): idle                 # self-loop; re-renders the panel
      schedule(daily 21:00, if no entry today): nudging

  clarify_value:
    ui: value_form
    on:
      log_weight(kg): logging
      no_answer(1 turn): idle                  # policy default: abstain

  logging:
    entry: tool log_weight(kg)
    on:
      tool_ok: logged
      tool_error: repair

  logged:
    ui: trend_panel(highlight: latest)
    say: generate                              # model writes the confirmation line
    on:
      correct_entry(kg?): confirm_fix          # prose or the fix_last control
      after(1 turn): idle

  confirm_fix:
    ui: confirm_card("replace {old} kg with {new} kg?")
    on:
      confirm: correcting
      cancel: idle

  correcting:
    entry: tool edit_last_entry(kg)            # edit, not append — repair semantics
    on:
      tool_ok: logged
      tool_error: repair

  repair:
    ui: value_form
    say: generate                              # model explains what failed
    on:
      log_weight(kg): logging
      no_answer(1 turn): idle

  nudging:                                     # agent-initiated; gap C1 "initiative"
    ui: value_form
    surface: notify
    on:
      log_weight(kg): logging
      no_answer(1 turn): idle                  # nudge fires at most once
```

### what binding UI-to-state buys

- **UI becomes a pure function of state.** Given the machine state, the rendered pattern is
  deterministic and testable — no per-turn improvisation about *whether/which* UI appears;
  the model improvises only inside declared `generate:` slots.
- **The canvas lifecycle problem dissolves.** `singleton_panel` + state re-entry means the
  panel updates in place; stale-panel accumulation cannot happen by construction.
- **Gates are just states.** `confirm_fix` *is* the approval gate from the triage's
  `gates:` sketch — no separate mechanism needed.
- **A2UI slots in cleanly.** `ui_patterns` compile to A2UI payloads; `emits:` maps A2UI's
  event back-channel onto FSM transitions. The protocol renders; the machine governs.

### open questions

- **Flat vs. statechart.** A long agent run concurrent with user chat wants parallel
  regions (statecharts), but v0 should stay flat until the weight tracker forces the issue.
- **Who classifies intents?** The model does (Bucket A); the FSM consumes classified
  intents. A misclassification therefore surfaces as a wrong transition — repair for that
  is `unknown_intent` + undo, worth a test case.
- **Should `say:` be patterned?** Currently free (triage #4: leave tone alone). Revisit
  only if evals show drift.
- **Compile target.** XState in the v0 runtime; each state constrains which `ContentBlock`
  types the chat route may emit — which is exactly the wiring gap in
  `app/api/chat/route.ts` (actionable 2 of the triage note).
