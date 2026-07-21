"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, LayoutPanelLeft, MessageCircle, Plus, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ConversationState, Message, StreamEvent } from "@/lib/domain";
import { applyCanvasUpdate, createMessage, textFromContent } from "@/lib/conversation";
import { RichRenderer } from "./rich-renderer";

const STORAGE_KEY = "maui:conversation:v1";
const EMPTY: ConversationState = { version: 1, messages: [], canvas: [] };

function MessageView({ message }: { message: Message }) {
  return (
    <article className={`message ${message.role}`} aria-label={`${message.role} message`}>
      {message.content.map((block, index) => {
        if (block.type === "text") return <ReactMarkdown key={index}>{block.text}</ReactMarkdown>;
        if (block.type === "component") return <RichRenderer block={block} key={index} />;
        return null;
      })}
      {message.status === "streaming" && !textFromContent(message.content) ? <span className="typing">Thinking</span> : null}
      {message.status === "error" ? <p className="message-error">{message.error}</p> : null}
    </article>
  );
}

export function MauiApp() {
  const [state, setState] = useState<ConversationState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState("");
  const [activePane, setActivePane] = useState<"canvas" | "chat">("chat");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const value = JSON.parse(stored) as ConversationState;
        if (value.version === 1 && Array.isArray(value.messages) && Array.isArray(value.canvas)) setState(value);
      }
    } catch { localStorage.removeItem(STORAGE_KEY); }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state, hydrated]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || abortRef.current) return;
    const userMessage = createMessage("user", text, "complete");
    const assistantMessage = createMessage("assistant", "", "streaming");
    const nextMessages = [...state.messages, userMessage];
    setDraft("");
    setState((current) => ({ ...current, messages: [...current.messages, userMessage, assistantMessage] }));

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.map((message) => ({ role: message.role, content: textFromContent(message.content) })) }),
        signal: abort.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to start the response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const streamEvent = JSON.parse(line) as StreamEvent;
          setState((current) => {
            let canvas = current.canvas;
            const messages: Message[] = current.messages.map((message): Message => {
              if (message.id !== assistantMessage.id) return message;
              if (streamEvent.type === "text_delta") {
                const content = [...message.content];
                const first = content[0];
                if (first?.type === "text") content[0] = { ...first, text: first.text + streamEvent.delta };
                return { ...message, content };
              }
              if (streamEvent.type === "content_block") {
                if (streamEvent.block.type === "canvas_update") canvas = applyCanvasUpdate(canvas, streamEvent.block);
                else return { ...message, content: [...message.content, streamEvent.block] };
              }
              if (streamEvent.type === "error") return { ...message, status: "error", error: streamEvent.message };
              if (streamEvent.type === "complete") return { ...message, status: "complete" };
              return message;
            });
            return { ...current, messages, canvas };
          });
        }
        if (done) break;
      }
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      setState((current) => ({ ...current, messages: current.messages.map((message): Message =>
        message.id === assistantMessage.id
          ? { ...message, status: cancelled ? "complete" : "error", error: cancelled ? undefined : error instanceof Error ? error.message : "Something went wrong." }
          : message,
      ) }));
    } finally { abortRef.current = null; }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(EMPTY);
    setDraft("");
  }

  const isStreaming = state.messages.some((message) => message.status === "streaming");

  return (
    <main className="app-shell">
      <header className="mobile-header">
        <span className="brand">maui</span>
        <nav aria-label="View">
          <button className={activePane === "canvas" ? "active" : ""} onClick={() => setActivePane("canvas")} aria-label="Show canvas"><LayoutPanelLeft size={18} /></button>
          <button className={activePane === "chat" ? "active" : ""} onClick={() => setActivePane("chat")} aria-label="Show chat"><MessageCircle size={18} /></button>
        </nav>
      </header>

      <section className={`canvas-pane ${activePane === "canvas" ? "mobile-active" : ""}`} aria-label="Canvas">
        <header><span className="brand">maui</span></header>
        <div className="canvas-content">
          {state.canvas.length ? state.canvas.map((block, index) => <RichRenderer block={block} key={index} />) : (
            <div className="canvas-empty"><LayoutPanelLeft size={25} strokeWidth={1.4} /><h1>Your canvas</h1><p>Charts, tables, files, and other working views will appear here.</p></div>
          )}
        </div>
      </section>

      <section className={`chat-pane ${activePane === "chat" ? "mobile-active" : ""}`} aria-label="Chat">
        <header className="chat-header">
          <span>Conversation</span>
          <button onClick={reset} aria-label="New conversation" title="New conversation"><Plus size={18} /></button>
        </header>
        <div className="messages" aria-live="polite">
          {!state.messages.length ? <div className="chat-empty"><h2>What are we working on?</h2><p>Ask a question or describe what you want to make.</p></div> : null}
          {state.messages.map((message) => <MessageView message={message} key={message.id} />)}
          <div ref={endRef} />
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onComposerKeyDown} placeholder="Message maui" rows={1} aria-label="Message" />
          {isStreaming ? (
            <button type="button" className="send-button" onClick={() => abortRef.current?.abort()} aria-label="Stop response"><Square size={13} fill="currentColor" /></button>
          ) : (
            <button type="submit" className="send-button" disabled={!draft.trim()} aria-label="Send message"><ArrowUp size={18} /></button>
          )}
        </form>
        <p className="disclaimer">AI can make mistakes. Check important information.</p>
      </section>
    </main>
  );
}
