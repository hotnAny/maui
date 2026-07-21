# maui — Specification

## Overview

maui is a chat-native interface that serves as a minimal, extensible platform for
agent-based applications. The long-term vision is a platform where designers can add
agents as plug-ins by uploading a package (containing an `AGENT.md`, a set of tools such
as `.py` files, example UI patterns, etc.).

This document specifies **v0**: a stripped-down, minimum-viable version of a prototypical
chat UI — the common denominator of ChatGPT, Claude, Gemini, and similar tools. v0
establishes the foundational platform that later versions will build the plug-in system on
top of.

## Goals

- Ship a vanilla, chat-native interface that feels familiar to anyone who has used a
  mainstream AI chat product.
- Keep the surface area minimal so the platform stays a clean foundation for the future
  agent plug-in system.
- Design the layout and response rendering so agents can later inject custom UI.

## Non-Goals (v0)

- The agent plug-in system (package upload, `AGENT.md`, tool loading, example UI patterns).
  Out of scope for v0, but it drives the architecture.
- Multiple agents or agent switching.

## Layout

A two-pane layout:

- **Left — Canvas.** A flexible display region that can show a dashboard, a data view
  (spreadsheet, charts, files, photos), etc.
- **Right — Chat.** A conventional chat UI. Because the AI's response may contain UI
  generated on the fly, the response renderer **must not assume responses are plain text** —
  it needs to render arbitrary/rich content, not just text.

## Visual Design

- Minimalistic and muted.
- Palette: black / grey / white.
- Use an icon family consistent with this style in lieu of text labels where appropriate.

## Technical Notes

- Model access via the OpenAI API (an API key will be provided).

## Future (beyond v0)

- Agent plug-in system: designers upload a package containing `AGENT.md`, a set of tools
  (e.g., `.py` files), and example UI patterns, which get added onto the platform.
