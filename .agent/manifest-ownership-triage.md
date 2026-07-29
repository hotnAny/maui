# Agent manifest: who specifies what

*Triage note, July 29, 2026. Follows up on `non-expert-agent-builders-report.md`, which
enumerated the eleven aspects every builder asks about. That report answered "what must be
specified." This one answers "by whom" — and therefore what AXE should add.*

## Short answer

Of the aspects a full agent manifest covers, roughly half are already owned by the model and
the harness and should be left alone, most of the rest are conventional designer-owned
configuration that AXE should adopt rather than reinvent, and only two are genuinely
unspecified anywhere: **the interaction model** (initiative, turn shape, gates, repair) and
**the presentation contract** (which UI a response may render, when, and how the user's
manipulation of that UI flows back in). Those two are AXE's territory. Memory is a middle
case: designers should specify memory *semantics* (what is worth remembering, who owns it,
what the user can correct) and never memory *mechanics*.

## The triage

| # | Aspect | Owner | Why |
|---|---|---|---|
| 1 | Purpose, job, success criteria | **Designer** | Domain truth; nothing else can supply it |
| 2 | Scope, refusals, escalation conditions | **Designer** | Product policy decision |
| 3 | Procedure / decision policy | **Split** | Designer states priorities and hard rules; model owns sequencing for fuzzy steps |
| 4 | Tone and prose style | Platform / model | Designers over-specify this and get little back |
| 5 | Knowledge sources, authority, conflict rules | **Designer** | Which source wins is a domain judgment |
| 6 | Retrieval mechanics (chunking, ranking, embedding) | Platform | Solved, tuned, and moving fast |
| 7 | Tool inventory and contracts | **Designer** | What capabilities exist at all is a design choice |
| 8 | Tool selection and orchestration | Platform / model | This is what the model is *for* |
| 9 | Credentials, sandboxing, audit, rate limits | Platform | Security infrastructure, not design surface |
| 10 | Approval thresholds (which actions need a human) | **Designer** | A UX decision with real consequences — see gap C2 |
| 11 | Context management, compaction, windowing | Platform | Harnesses do this better than any spec could |
| 12 | Durable memory *schema and policy* | **Designer** | What persists, who owns it, retention, correction |
| 13 | Memory *storage and recall mechanics* | Platform | Same reasoning as #6 |
| 14 | Triggers and completion conditions | **Designer** | Ties into initiative — see gap C1 |
| 15 | Transport-level error recovery, retries | Platform | Nothing design-specific here |
| 16 | Evaluation examples and adversarial cases | **Designer** | Domain judgment; the cheapest high-value artifact |
| 17 | Versioning, draft/publish, monitoring | Platform | Lifecycle plumbing |
| 18 | **Interaction model** | **Designer — unspecified today** | Gap C1 |
| 19 | **Presentation / UI contract** | **Designer — unspecified today** | Gap C2 |

## A. Leave it alone

The temptation is to make AXE a control panel over everything. Resist it for #4, #6, #8, #9,
#11, #13, #15, #17. Two arguments:

- **They are converging fast and improving without you.** Compaction, retrieval, and tool
  choice were all hand-tuned two years ago and are now harness defaults. A manifest field that
  pins them freezes the agent to today's frontier.
- **Specifying them fights the model.** The survey's own finding was that graph-based control
  in Voiceflow and Copilot Studio gets used for the deterministic *minority* of behavior. When
  a designer writes out the tool sequence, they are re-implementing planning by hand and
  losing the model's ability to recover from a surprise.

The one thing worth exposing from this bucket is **observability**, not control: let the
designer *see* what the harness decided (which tool, why, what got compacted away) so they can
fix the spec. Inspect, don't override.

## B. Conventional and designer-owned

For #1, #2, #5, #7, #10, #12, #14, #16 — adopt the shape the survey already extracted rather
than inventing a dialect. Prose for intent, schemas for bindings, examples for quality. The
one place to sharpen it:

**Memory.** This is what the to-do was uncertain about, and the split is cleaner than it
looks. The designer specifies:

```yaml
memory:
  facts:                                  # the schema, not the store
    - key: goal_weight_kg
      scope: user
      set_by: user | agent_inferred
      retention: until_changed
      user_visible: true                  # shows in a review/correct surface
      user_deletable: true
  recall_policy: "always load facts; never infer weight from conversation history"
  forget_on: ["user requests deletion", "agent goal changes"]
```

The designer never specifies embeddings, summarization cadence, or context assembly. The test:
if the field would change when the underlying model changes, it belongs to the platform.

## C. The gaps — AXE's territory

### C1. Interaction model

No surveyed tool lets a designer specify this coherently. Copilot Studio topics and Voiceflow
flows are the closest, and they are conversation *scripts*, which is a different thing —
they encode what the agent says, not the terms of engagement. The open questions:

- **Initiative.** May the agent open a turn? On what trigger, and does it interrupt, notify, or
  quietly update the canvas?
- **Turn shape.** Is a request one response or a multi-step run? If long, what does the user see
  while waiting, and can they steer mid-run without restarting?
- **Gates.** Which actions stop and wait for a human, and what does the stop look like?
- **Clarification.** When does the agent ask instead of assuming, how many questions at once,
  and what is the default when the user does not answer?
- **Repair.** When the agent gets it wrong, what does the user do — re-prompt, edit the input,
  edit the artifact, or undo the write? Each implies different plumbing.

Proposed manifest section:

```yaml
interaction:
  initiative: user | mixed | agent
  proactive:
    - on: "schedule: daily 21:00"
      condition: "no entry logged today"
      surface: notify | canvas_only | chat
  turn:
    long_task:
      threshold: 3s
      progress: step_labels | stream_reasoning | none
      interruptible: true
  gates:
    - action: delete_entry
      require: explicit_confirm
      surface: inline_card
  clarification:
    ask_when: ["unit missing", "ambiguous date"]
    max_questions_per_turn: 1
    on_no_answer: abstain | assume_and_label
  repair:
    user_can: [edit_last_input, edit_rendered_artifact, undo_last_write]
    correction_becomes: new_turn | state_patch
```

### C2. Presentation contract

Everyone building GenUI has a component registry; nobody has a *specification* of when the
agent may reach for which component, and — the bigger hole — **how a user's manipulation of a
rendered component becomes agent input**. GenUI as shipped today is one-way display. If the
canvas shows an editable timeline and the user drags an event, that gesture has to re-enter the
agent as an intent, or the UI is decoration.

```yaml
presentation:
  default_surface: chat | canvas
  prose_vs_gui:
    prefer_gui_when: ["time series", "comparison over 3+ items", "a draft awaiting approval"]
    always_include_text_summary: true       # accessibility + degradation
  templates:
    - id: weight_trend
      component: line_chart
      when: "after a successful log, or when asked about progress"
      surface: canvas
      lifecycle: singleton_panel            # replaces itself, does not stack
      data_contract: {points: [{date, kg}], goal_kg?}
      interactive:
        - control: date_range
          emits: "intent: change_range(from, to)"   # the back channel
      fallback_text: "Logged 67.65 kg. 7-day change: -0.4 kg."
```

Three commitments worth making explicit in the format: every template declares a
`fallback_text` (so a response degrades to prose), every interactive control declares what
intent it `emits` (so manipulation is not a dead end), and every template declares a
`lifecycle` (so the canvas does not accumulate stale panels — the persistence asymmetry between
a durable canvas and an ephemeral chat is unaddressed everywhere).

## On the FSM idea

The to-do proposed an FSM for the interaction model. My read: **an FSM is the right primitive
for the gates and wrong for the whole.** It earns its keep exactly where behavior must be
deterministic — approval before an irreversible write, required-field collection before a tool
call, escalation paths. Everywhere else it recreates the Bucket-A mistake: a designer
hand-drawing what the model already does, then owning every path they forgot to draw.

The generalization that fits the rest is **policy, not graph**: constraints and invariants
("never write without confirmation", "at most one question per turn", "progress after 3s") plus
trigger→surface bindings. Declarative, composable, and it degrades gracefully when the agent
encounters a situation the designer never imagined — which an FSM does not.

## Grounding: does this cover the weight tracker?

`agents/weight-tracker/scratch-pad.md` specifies one task: log weight → status + trend UI.
Under the triage, that decomposes to `tools.log_weight` (Bucket B, conventional),
`presentation.templates.weight_trend` (gap C2), and — the part the scratch-pad leaves silent —
whether the agent nudges at 9pm when nothing was logged (gap C1, `initiative`), and what
happens when the user says "no, that was 67.5" (gap C1, `repair`). Two of four live in the
gaps. That ratio is the argument for the note.

## State of the code

The v0 runtime has the presentation layer typed but unwired: `ContentBlock` in
[lib/domain.ts:13](lib/domain.ts#L13) already includes `component` and `canvas_update`, with
matching Zod validators in [lib/schemas.ts](lib/schemas.ts), but
[app/api/chat/route.ts:52](app/api/chat/route.ts#L52) only forwards `output_text.delta` — the
model is never told the block vocabulary exists and cannot emit one. There are no tools, and
no manifest loading. So C2 can be prototyped against types that already exist; C1 has no
runtime hooks at all.

## Actionables

1. **Pick a case study and write both gap sections by hand** — weight tracker is the smallest.
   Writing `interaction:` and `presentation:` for a real agent will falsify the schemas above
   faster than more surveying.
2. **Wire the block vocabulary end-to-end** (structured output in the chat route + registry
   render) so `presentation.templates` has something to compile into.
3. **Build the back channel next, not last.** `interactive.emits` is the claim that separates
   this from every existing GenUI registry; if it is hard, better to know now.
4. **Do not add manifest fields for anything in Bucket A.** If a Bucket-A field feels
   necessary, that is a signal the platform needs an inspector, not the manifest a knob.
