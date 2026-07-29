# UI Redesign Proposal

## Diagnosis

The current interface is a competent ChatGPT clone with a card grid attached. It is not
boring because of the palette. It is boring because of what it depicts: a **transcript**
on the right and an **output bin** on the left.

Three things are missing that the scratch-pad says matter:

1. **The agent is invisible.** `AGENT.md` treats memory, workflows, tools, and UI patterns
   as the substance of an agent. None of them appear on screen. Nothing distinguishes maui
   from a text box wired to an API.
    ```XAC: this is intentional--the current UI is just a skeleton```
2. **The process is invisible.** A streaming response shows the word "Thinking" and then
   text. There is no sense of an agent doing work.
3. **The canvas is inert.** Panels arrive, sit in a grid, and have no relationship to the
   conversation that produced them, no persistence controls, and no way to be talked about.

The palette is not the problem, and changing it would contradict the spec. The redesign
below stays in black/grey/white and gets its energy from typography, density, motion, and
above all from **showing the agent instead of hiding it**.

---

## Move 1 — Bidirectional canvas/chat linkage

Today `canvas: ComponentBlock[]` is a flat list with no provenance. Give every panel an id
and a `sourceMessageId`, then:

- Hovering a canvas panel highlights the assistant turn that produced it; hovering a turn
  dims every panel it did not produce.
- Each panel gets a hairline header with a mono caption (`TURN 4 · 12:41`) plus pin and
  dismiss controls. Pinned panels survive `canvas_update: replace`.
- Clicking a panel attaches it to the composer as a scoping chip (`↳ Revenue by region`),
  so the next message is explicitly about that panel.

This is the highest-value move. It is the one gesture that makes the two panes read as a
single workspace rather than two widgets, and it directly serves the scratch-pad's
position that direct manipulation should be *minimal and in service of chat*.

```XAC: not ready to make this decision. currently i imagine the canvas can serve as a dashboard or data view for a specific agentic app; as chat responses will contain generated UIs, these UIs can also be pinned onto the canvas. for now, keep this move as an idea. don't commit yet```

## Move 2 — The activity spine

Replace the `Thinking…` string with a structured trace rendered inside the assistant turn:
a thin vertical rule with timestamped steps (`reading conversation`, `calling
get_forecast`, `composing panel`), collapsed by default to a single summary line, expandable
on click, and collapsing to a one-line receipt when the turn completes.

This is what makes the screen read as agent-native within the first three seconds of use.
It also gives `tools/` from the agent manifest a place to exist in the UI before the
plug-in system is built.

Requires a new stream event; see Staging below.

```XAC: not critical. shelf it.```

## Move 3 — Agent presence

Give the left edge of the canvas header an agent identity block: the active agent's name,
a live/idle state dot, and its capabilities as icon chips — memory, workflows, tools,
UI patterns. In v0 there is one agent and the chips can open read-only drawers backed by
stubs.

Even stubbed, this stakes out the plug-in architecture visually: the screen stops saying
"a chat app" and starts saying "a platform something is installed into." When agent
packages land, this block becomes the switcher with no layout change.

A memory drawer is the most interesting of the four, because "what does this thing
remember about me" is a question no mainstream chat UI answers well.

```XAC: not critical. shelf it.```

## Move 4 — Make "GUI on-demand" visible

The tenet is *chat-native, GUI on-demand*, and the scratch-pad flags it as needing
verification. The UI should make it demonstrable:

- Rich blocks rendered inline in chat get a **promote to canvas** control.
- Canvas panels get a **collapse back to chat** control.

Watching UI move between the ephemeral surface and the persistent one is the clearest
possible argument for the paradigm, and it turns an untested tenet into something a viewer
can try in one click.

```XAC: not critical. shelf it.```

## Move 5 — Visual system

Escaping "boring" without leaving greyscale:

- **Type.** `Arial, Helvetica` is doing real damage. Pair a neutral grotesque for UI with
  a monospace for all metadata: panel captions, stat labels, trace steps, timestamps,
  table headers. Mono-for-metadata is the single strongest move toward an instrument-panel
  feel and costs one font load.
- **Scale contrast.** Stat cards should pit a large optical-aligned number against a small
  uppercase mono label. Right now everything sits between 13px and 25px, which is why the
  page reads flat.
- **Surfaces.** Keep exactly three: paper, recessed canvas, and hairline. Reserve solid
  black fill for one thing only, the send affordance. Discipline here is what makes
  greyscale look intentional rather than unfinished.
- **Canvas texture.** A faint dot-grid on the canvas surface so an empty canvas reads as
  workspace rather than dead space.
- **Motion.** Panel entry staggered at 120–160ms, trace steps ticking in, a caret on
  streaming text. The existing `prefers-reduced-motion` block already covers this.
- **Accent.** Recommend staying fully achromatic and letting motion carry liveness. If one
  accent is ever introduced, spend it exclusively on agent activity state, never on
  decoration.

```XAC: sounds good. remember to keep it simplistic and minimalistic```  

## Move 6 — Empty states that demonstrate

`Your canvas / Charts, tables, files, and other working views will appear here` describes
the product instead of showing it. Replace both empty states with three or four one-tap
starters that produce real canvas panels immediately. A first-time viewer should see the
two-pane paradigm work inside five seconds without typing anything.

```XAC: i'd rather keep it just empty empty```

---

## Staging

**Stage 1 — presentation only.** No data-model change. Type system, surfaces, mono
metadata, scale contrast, dot-grid, panel entry motion, empty-state starters, panel
chrome. This alone removes most of the "boring" and is a contained CSS + markup pass over
`globals.css`, `maui-app.tsx`, and `rich-renderer.tsx`.

**Stage 2 — client state.** Panel ids and `sourceMessageId` on `ComponentBlock`, hover
linkage, pin/dismiss, promote/collapse, composer scoping chip. Touches `lib/domain.ts`,
`lib/schemas.ts`, `lib/conversation.ts`, and the persisted-state version (bump to 2 with a
migration, since `STORAGE_KEY` is at `v1`).

**Stage 3 — protocol.** Activity spine and agent presence. Needs a new
`StreamEvent` variant (`{ type: "activity"; step: string; state: "start" | "done" }`)
emitted from `app/api/chat/route.ts`, plus a stub agent manifest to back the capability
chips.

## Note on scope

Moves 2 and 3 touch territory `spec.md` lists as v0 non-goals (tools, multiple agents,
package loading). The proposal keeps them presentational: a trace of work the model
already does, and a capability display backed by stubs. No plug-in machinery is implied.
If that still reads as scope creep, Stages 1 and 2 stand on their own and deliver most of
the visual gain.
