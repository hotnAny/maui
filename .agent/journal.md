# Work journal

## 2026-08-15

## 2026-08-05

**Done**
- Compile now emits `agents/<id>/README.md` (R6/R7 in `compilation-rules.md`): `lib/agent/readme.ts` + `npm run compile:agents`, with `-- --check` as the CI freshness check and a test pinning the committed file. Diagram styled with the beautiful-mermaid "Mist" palette and an icon vocabulary (📍 state, 🖥️ UI, 👨🏻‍💻 user, 🤔 verdict, 🧰 tool), each piece on its own line.
- FSM notation formalized in `.agent/fsm-notation.md` (N1–N7) and migrated everywhere: pattern params became *named UI states* (`pattern[with-input]`, `?with-input` layout tags), and an edge now spells out both halves — trigger and `do:` — with `do: none` for pure transitions.
- Sanity check before logging: new `agent:` channel whose triggers are verdicts the model picks among, a judging state `s4` that both the typed and the button path route through, and `s3`'s `value-check` card offering the correction. Verified by replaying `/weight-tracker 685` against the real route handler.

**Open**
- `heuristicVerdict` in `app/api/agent/route.ts` is weight-specific domain logic sitting in platform code (band 20–300 kg, decimal-slip guess). It exists because the model call had never actually worked; delete it once the judgment path is proven.
- The judgment hop has no test — it needs a live model call. `judgmentConfig`, the default fallback, and both `advance` paths out of `s4` are covered.
- Static checks 2, 3, 5, 6, 7 in `compilation-rules.md` §4 are still unimplemented (1, 4, 8, 10 are enforced). No CI workflow exists, so `compile:agents -- --check` only runs by hand.
- `stateConfig(s2).toolAllowlist` is now empty by R2 — correct, but it means the model in s2 has no tools; unexamined behavior change.
- Mermaid caveat: an init directive's `fontFamily` is blanked if it holds a comma or hyphen, and a quoted family drops the whole theme block. Pinned by a test; worth fixing upstream in the skill's `reference.md`.

**Next**
- Decide whether the LM verdict prompt needs domain guidance (an eval), then remove `heuristicVerdict`.
- Or: implement static check 8 (exactly one `default: true` per judging state) — the missing-default bug is what made `/weight-tracker 685` fail today.

## 2026-07-30

**Done**
- Triage note revised per xac's inline review: "generative user interfaces" adopted as the term, A2UI analyzed (platform mechanics → compile target, not a substitute for the designer contract), triage owner-column sources made explicit.
- Interaction spec: xac's 3-state FSM + pattern spec promoted to `agents/weight-tracker/manifest.yaml`; AXE-level semantics extracted to `.agent/compilation-rules.md` (R1–R5, pattern mini-language → A2UI, static checks).
- Manifest compiled into a running agent: `lib/agent/*` (loader, pattern compiler, FSM engine), `/api/agent` (R4 split: ui events bypass the model; chat gets a bare-number heuristic then one classification call), custom-catalog A2UI renderer, surface stacked above the composer. 15 tests; all FSM paths verified against the live server.

**Open**
- Renderer speaks A2UI's message shapes but prop names are unchecked against the v0.9.1 component gallery; no custom catalog definition exists yet.
- `do:` transition syntax specified only by example. Gemini API key created but unused — classification runs on the platform's OpenAI wiring.
- Richer 8-state FSM sketch (clarify/confirm/repair/nudge, gates-as-states) parked in `agents/weight-tracker/recycle.md`; v0 implements only xac's 3-state cut.

**Next**
- Exercise gates-as-states for real: add `correct_entry` → `confirm_fix` to the manifest and see whether the compile rules survive a state with a confirmation gate.
- Or: implement the static checks (compilation-rules §3) in the manifest loader so invalid manifests fail at load, not at runtime.
