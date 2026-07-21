# maui v0 — Implementation Plan

## Objective

Build a minimal two-pane AI chat application that feels familiar, keeps OpenAI credentials
server-side, and establishes stable boundaries for future agent plug-ins and agent-rendered UI.

## Working assumptions

- Use a TypeScript web stack with React and a small server/API layer. A concrete default is
  Next.js (App Router), which keeps the v0 client and server in one deployable project.
- Use the OpenAI Responses API with streamed output.
- Keep v0 single-user and store conversation state in the browser unless persistence is
  explicitly required.
- Treat rich UI as trusted, application-owned components selected from a registry. Do not
  execute arbitrary model-generated HTML, JavaScript, or React code.
- The canvas starts with a useful empty state and can be updated by structured assistant
  output; it is not a full dashboard builder in v0.

## Architecture

### Application shell

- A responsive two-pane layout with a flexible canvas on the left and chat on the right.
- Central design tokens for the black/grey/white palette, typography, spacing, borders,
  focus states, and motion.
- A single icon family (recommended: Lucide) with accessible labels/tooltips.
- On narrow screens, switch from side-by-side panes to a canvas/chat tab or drawer pattern.

### Conversation domain

Define UI-independent types before building components:

- `Conversation`: id, title, timestamps, messages.
- `Message`: id, role, status, ordered content blocks, timestamps, optional error metadata.
- `ContentBlock`: a discriminated union, initially supporting `text`, `markdown`,
  `component`, and `canvas_update`.
- `ComponentBlock`: registry key, version, validated props, and optional fallback text.
- `CanvasState`: ordered panels or one active view, with typed data and revision metadata.

Keep model/provider payloads behind an adapter so OpenAI-specific response objects never
become the application's rendering contract.

### Rich-content safety boundary

- Build a component registry mapping known keys to local React components and prop schemas.
- Validate every structured block on the server and again at the rendering boundary.
- Render unknown or invalid blocks as a safe fallback card; never evaluate generated code.
- Sanitize Markdown links/content and disable raw HTML.
- Version the content-block envelope so future plug-ins can add renderers without changing
  historical messages.

### OpenAI integration

- Add a server-only chat endpoint that accepts normalized conversation input.
- Validate request size and shape, call the Responses API, and stream normalized events to
  the client (`message_start`, text delta, block, canvas update, error, completion).
- Keep the API key in environment variables and provide an `.env.example` without secrets.
- Add cancellation via `AbortController`, guarded retries for transient pre-stream failures,
  and user-readable errors.
- Centralize model name, system instructions, timeouts, and token/input limits in server
  configuration.

## Delivery phases

### 1. Bootstrap and quality baseline

- Initialize the chosen TypeScript application and package scripts.
- Add linting, formatting, type-checking, and unit-test configuration.
- Establish directories for `app`, `components`, `domain`, `renderers`, `server`, and tests.
- Add environment validation and developer setup documentation.

Exit criteria: a clean app runs locally; lint, type-check, and test commands pass.

### 2. Design system and responsive shell

- Implement tokens and global styles.
- Build the two-pane shell, pane resizing if desired, mobile pane switching, and canvas empty
  state.
- Add accessible icon buttons, keyboard focus behavior, loading states, and reduced-motion
  support.

Exit criteria: layout works at desktop and mobile widths with keyboard-only navigation.

### 3. Core chat experience

- Implement the message list, user and assistant message treatments, composer, send/cancel,
  auto-scroll behavior, and empty/loading/error states.
- Support multiline input, Enter-to-send, Shift+Enter for newline, and composition events.
- Add a local conversation store with explicit actions rather than coupling state to views.
- Render Markdown with code blocks, links, lists, and copy affordances.

Exit criteria: a mocked streaming conversation works end-to-end and remains usable during
long responses and failures.

### 4. Server streaming integration

- Implement the server endpoint and OpenAI adapter.
- Translate provider events into the app's normalized stream protocol.
- Connect optimistic user messages and streaming assistant messages to the client store.
- Add cancellation, timeout, malformed-request, rate-limit, and provider-error handling.

Exit criteria: a real API-key-backed conversation streams correctly, cancels cleanly, and
does not expose credentials to the browser.

### 5. Rich response and canvas foundation

- Implement schemas and the renderer registry.
- Ship a small representative component set, such as a stat card, data table, image/file
  card, and simple chart, to prove the contract is not text-only.
- Implement declarative canvas update actions such as replace view, add panel, update panel,
  and clear.
- Add fallback rendering and error boundaries around each rich block.
- Define a system/developer prompt or structured-output mechanism that teaches the model the
  supported block schema.

Exit criteria: a response can combine text and local rich components and can update the
canvas without executing arbitrary generated code.

### 6. Persistence and conversation lifecycle

- If browser-only persistence is accepted, save versioned conversation/canvas state to
  local storage and add new-chat/reset behavior.
- If accounts or cross-device history are required, introduce a database-backed repository
  behind the same store interface instead.
- Add migrations or graceful invalidation for stored schema versions.

Exit criteria: refresh behavior matches the chosen persistence policy and corrupt/old data
fails safely.

### 7. Verification and release readiness

- Unit-test schemas, stream reduction, store actions, renderer fallback, and canvas updates.
- Integration-test the chat endpoint with a mocked OpenAI client.
- Add browser tests for send/stream/cancel/retry, rich blocks, canvas updates, mobile layout,
  and keyboard access.
- Check color contrast, focus order, screen-reader labels, overflow, and reduced motion.
- Document local setup, architecture decisions, supported rich blocks, and deployment.

Exit criteria: automated checks pass, the primary flows pass on desktop/mobile viewports,
and a fresh developer can run the project from the README.

## Suggested first release scope

Include one conversation, browser persistence, streamed Markdown, cancel/retry, responsive
two-pane navigation, and 3–4 allowlisted rich components. Defer authentication, shared or
cloud history, file uploads, web search/tools, arbitrary code rendering, agent packaging,
and multiple agents.

## Definition of done

- Users can start/reset a conversation and exchange streamed messages with OpenAI.
- The API key is never included in client code, browser storage, or committed files.
- Assistant messages support ordered mixed content and degrade safely when a block is not
  recognized.
- Structured responses can update the canvas through validated declarative actions.
- The experience is responsive and supports keyboard navigation and accessible labels.
- Errors, cancellation, refresh, and empty states are deliberately handled.
- Lint, type-check, unit/integration tests, and critical browser tests pass.

## Decisions needed before implementation

1. Should the default stack be Next.js/TypeScript, or is another framework/deployment
   target required?
2. For v0, should conversations survive refresh only on the current browser, persist in a
   database, or disappear on refresh?
3. Should the canvas be changed only by assistant-issued structured actions, or also be
   directly editable by the user in v0?
4. Is Markdown plus an allowlisted component registry the intended meaning of “UI generated
   on the fly,” or must v0 support sandboxed executable UI/code?
5. Which OpenAI model should be the default, and is there a target hosting environment?

