# CUJ → FSM: the protocol an agent creator follows

*Maintained doc. Written August 5, 2026, generalized from the weight tracker (built) and
tested against the kids party planner (being specified). Input: a Critical User Journey —
**user, goal, tasks, success criteria**. Output: a compilable `interaction.fsm` plus a UI
pattern bound to each state. Notation: `.agent/fsm-notation.md`. Compilation:
`.agent/compilation-rules.md`. Patterns: `.agent/pattern-library.md`.*

The protocol exists because the jump from a CUJ to a machine is where creators get it
wrong in a specific, repeatable way: they turn each task into a state. That produces a
script, not an interaction model. Step 1 is the correction.

## 0 — complete the CUJ

All four parts, or the machine has no shape:

| CUJ part | what it decides in the FSM |
|---|---|
| user | nothing structural — it sets the register of every `desc:` |
| goal | `agent.purpose` |
| tasks | the **edges** (step 1) |
| success criteria | where `end: true` goes (step 6) |

A CUJ missing its success criteria cannot be compiled: nothing says when the machine is
done. (The kids party planner's scratch-pad is missing exactly this.)

## 1 — sort tasks into moves and modes

For each task, ask: **while the user is doing this, is there something on screen they act
on?**

- **no → the task is a move**: an edge. It fires, something happens, the machine is
  elsewhere. Most tasks are moves.
- **yes → the task implies a mode**: a state, whose `desc:` names what is live.

The default is *edge*. Evidence from the weight tracker: four tasks ("log weight", "view
trend", …) produced nine edges and five states, and only one state came from a task
directly. States are the modes *between* moves, and there are usually fewer of them than
there are tasks.

## 2 — pick the machine's shape

One test: **can the user do task N before task N−1?**

- **all yes → hub.** One planning state whose UI shows the whole artifact, with an
  excursion per decision that returns to it. Re-entering the hub re-materializes the data
  (R3), so the summary is never stale.
- **all no → wizard.** A linear chain; each state is one decision.
- **mixed → wizard head, hub tail.** Gate the prerequisites, then open up.

The weight tracker is degenerate (one task) and so proves nothing here; the party planner
is a hub — a parent picks the cake before the venue whenever the bakery is the constraint.

## 3 — write the states

One line each: `desc:` naming the mode, not the utterance ("dashboard with a weight input
field", not "asks for weight"). N2. Leave `ui:` blank for now.

## 4 — write the edges

For each move from step 1: which state it leaves, which it enters, what fires it
(`chat:` prose, `ui:` a control, or both), and what it runs (`do:`). Write `do: none`
explicitly when nothing runs — it is the difference between a navigation and a write, and
the reader cannot infer it. N5–N7.

## 5 — insert judgment where a write could be wrong

For each edge whose `do:` writes something **the user could have gotten wrong, or that is
awkward to undo**, insert a judging state before it: a state with no `ui:` whose outgoing
edges are `agent:` verdicts. The agent's own reasoning becomes part of the machine instead
of hiding in a prompt.

Two rules learned the hard way:

- route **every** channel into the judging state. A check that lives in chat-intent
  classification misses `ui:` events entirely, because they never reach the model (R4).
- mark the **cautious** verdict `default: true`. The default is what runs when the agent
  cannot think; if it is the writing branch, the check silently disappears the moment a
  model call fails.

## 6 — place the end states

Translate each success criterion into a state where it holds, and mark it `end: true`.
The surface persists after the machine ends (R5), so "the user still sees the plan" is not
a reason to keep the machine running.

## 7 — bind a UI pattern to each state

Consult `.agent/pattern-library.md` before writing a new pattern. Two rules:

- the pattern bound to a state must **emit every `ui:` trigger leaving that state**, and
  every event it emits must lead somewhere (static checks 2 and 3);
- when two states differ only in *what is shown*, that is one pattern with two **UI
  states** (`pattern[with-input]`), not two patterns. N3/N4.

## 8 — verify before compiling

- **Traceability**: every CUJ task appears in at least one edge; every edge traces back to
  a task, an agent verdict, or a declared escape. An edge tracing to nothing is scope the
  CUJ never asked for; a task tracing to nothing is the feature you forgot.
- **Static checks**: `.agent/compilation-rules.md` §4.
- **Read the generated diagram** (`npm run compile:agents`). Reading it back against the
  CUJ is the cheapest review there is: a state with no way out, a write that skips its
  judging state, and a dead affordance are all visible at a glance.

## Worked example — the weight tracker, retrofitted

| CUJ | → | machine |
|---|---|---|
| goal: log daily weight, see the week | → | `agent.purpose` |
| task: log a weight | → | edges `s0→s4`, `s2→s4` (move, not a state) |
| task: view the trend | → | states `s1`/`s2` — the mode the log happens *in* |
| implicit: don't record a typo | → | judging state `s4`, verdicts `plausible` / `suspect` (step 5) |
| success: today's weight is recorded and the week is visible | → | `s1`, `end: true` |

## Where it is still thin

- Steps 1–2 are heuristics with one and a half case studies behind them. The hub shape has
  not survived contact with a compiler yet.
- Nothing here helps decide *where candidate data comes from* (live tools, model knowledge,
  user-supplied) — the party planner's first blocker, and a `tools:` question the protocol
  currently steps over.
- Cross-cutting constraints (a budget every selection must respect) have no home in the
  notation. Step 4 has nowhere to put them; see the `policies:` sketch parked in
  `agents/weight-tracker/recycle.md`.
