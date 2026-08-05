# UI pattern library

*Maintained doc. Started August 5, 2026, seeded from the weight tracker. Patterns are
authored in the pattern mini-language and compile to A2UI (`.agent/compilation-rules.md`
§2); this file is the **index a creator consults at step 7 of `.agent/cuj-to-fsm.md`** —
what exists, what each is for, and what it costs to use.*

**The entries point at the patterns; they do not copy them.** A pattern's definition lives
in the `genui.patterns` block of the manifest that first needed it, and this index links
there. With two patterns, a copy here would be a second source of truth that drifts on the
first edit. When a third agent needs an existing pattern verbatim, that is the moment to
make patterns loadable by id — see "Open: resolution" below.

## Entry format

Every entry states the five things that decide whether a pattern fits a state:

| field | why a creator needs it |
|---|---|
| **for** | the mode it renders — matched against a state's `desc:` |
| **UI states** | the variations it already has; a new variation is cheaper than a new pattern |
| **binds** | the data the agent must be able to materialize, by shape |
| **emits** | the `ui:` triggers it can fire — a state's outgoing edges must be covered by these |
| **needs** | catalog components; anything outside the standard A2UI catalog must ship in the agent's own |

## Patterns

### `trend-line-dashboard`

- **for**: a time series the user reviews, optionally with an entry control in the same card
- **from**: [`agents/weight-tracker/manifest.yaml`](../agents/weight-tracker/manifest.yaml)
- **UI states**: `trend-only` (review only) · `with-input` (adds the entry row)
- **binds**: a point list `[{date, value}]`, a delta, a latest value, and the entry field
- **emits**: `log_weight(kg)`
- **needs**: `Card`, `Column`, `Row`, `Text`, `LineChart`, `NumberField`, `Button` —
  `LineChart` is **not** in the standard A2UI catalog and ships in `weight-tracker/v1`
- **note**: the `?with-input` tag is the entire diff between the two variations. This is the
  reference example of one pattern serving several machine states.

### `value-check`

- **for**: the agent questions a value the user supplied and offers a correction — the UI
  half of a judging state's `suspect` verdict (step 5 of the protocol)
- **from**: [`agents/weight-tracker/manifest.yaml`](../agents/weight-tracker/manifest.yaml)
- **UI states**: one rendering, unnamed
- **binds**: a question string, a suggested value, the value as entered
- **emits**: `accept_suggestion(kg)` · `confirm_as_entered(kg)`
- **needs**: `Card`, `Column`, `Row`, `Text`, `Button` — standard catalog only
- **note**: the most reusable thing here is its *shape*, not its bindings: question, take
  the suggestion, keep what I said. Generalizing it means parameterizing the value's name,
  which the pattern language cannot express yet (see gaps). Expect to copy and rename it
  for the next agent, and to lift it properly on the third.

## Wanted — from the kids party planner

Named now because the party planner will need them, and because two of the three are
blocked on language gaps rather than on design:

- **intake form** — several fields, some optional, one submit. Straightforward today.
- **candidate list** — N options (venues, cakes, activities) with a select action per row.
  **Blocked**: the layout language has no repeat construct (see gaps).
- **plan summary** — the hub's surface: the whole artifact with filled and empty slots,
  each slot a way back into its decision. Needs a "this slot is still empty" rendering,
  which is a UI-state variation per slot — combinatorial, and the first real test of whether
  named UI states scale past two.

## Known gaps this library is blocked on

1. **No iteration.** `layout:` is a static tree, so "one row per candidate in
   `@/venues/candidates`" is unexpressible. Every selection task in a planning agent is
   exactly that shape. This is the single biggest blocker on growing the library, and it is
   a change to the mini-language, not to any manifest.
2. **Thin catalog.** The renderer knows `Card`, `Column`, `Row`, `Text`, `LineChart`,
   `NumberField`, `Button` ([`components/a2ui-renderer.tsx`](../components/a2ui-renderer.tsx)).
   No image, chip, list, or date control — which the wanted patterns need.
3. **No pattern parameters beyond variations.** A pattern can vary *what is shown*
   (`?ui-state`) but not *what it is about*: `value-check` hardcodes `kg`. Reuse across
   agents needs either a parameter slot or a convention for renaming binds.

## Open: resolution

Today `genui.patterns` is declared inline per manifest, so every agent that wants
`value-check` copies it. The alternative is a shared `patterns/` directory the compiler
resolves by id (`ui: value-check@v1`), which removes the copies but fixes the format before
gap 3 is understood. Recommendation: stay inline until a third agent needs a second-hand
pattern, then lift — and let the shape of that first real reuse decide whether patterns take
parameters.
