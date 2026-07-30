# Work journal

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
