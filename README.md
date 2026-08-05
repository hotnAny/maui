# maui

A minimal two-pane interface for agent-native applications. v0 provides a flexible canvas,
a streamed OpenAI chat, browser-local history, and a safe registry for rich response UI.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add an OpenAI API key.
3. Optionally change `OPENAI_MODEL` to another Responses API-compatible model. The default
   is `gpt-5.6-terra`, selected as the balanced quality/cost member of the current family.
4. Start the app with `npm run dev` and open `http://localhost:3000`. The development
   launcher deliberately prefers the project key in `.env.local` over any
   `OPENAI_API_KEY` inherited from the host shell.

Without an API key, the interface loads normally and shows a configuration error when a
message is sent.

## Commands

- `npm run dev` — local development server
- `npm run compile:agents` — regenerate each `agents/*/README.md` from its manifest
  (`-- --check` fails instead of writing, for CI)
- `npm run build` — production build
- `npm run lint` — ESLint checks
- `npm run typecheck` — strict TypeScript checks
- `npm test` — unit tests

## Architecture

- `app/api/chat/route.ts` keeps credentials server-side and translates OpenAI streaming
  events into newline-delimited application events.
- `lib/domain.ts` defines provider-independent messages, content blocks, and canvas state.
- `components/rich-renderer.tsx` is the allowlisted component registry. Generated code is
  never evaluated; unknown and invalid blocks fall back safely.
- `components/maui-app.tsx` owns the v0 conversation/canvas store and versioned local storage.

The first slice streams text today. The normalized stream already supports validated rich
blocks and canvas updates, allowing a structured-output adapter to be added without changing
the UI or persisted message contract.

## Current scope

Authentication, database persistence, file uploads, tools, multiple agents, agent package
loading, and arbitrary executable UI are intentionally outside v0.

## Dependency note

As of the initial implementation, `npm audit` reports a moderate PostCSS advisory inherited
through the current stable Next.js release. npm offers only a destructive downgrade as an
automated fix, so the dependency remains pinned to the current stable major pending an
upstream patched release.
