export type TextBlock = { type: "text"; text: string };
export type ComponentBlock = {
  type: "component";
  component: "stat" | "table" | "note";
  props: Record<string, unknown>;
  fallback?: string;
};
export type CanvasUpdateBlock = {
  type: "canvas_update";
  action: "replace" | "append" | "clear";
  panels?: ComponentBlock[];
};
export type ContentBlock = TextBlock | ComponentBlock | CanvasUpdateBlock;

export type Message = {
  id: string;
  role: "user" | "assistant";
  status: "streaming" | "complete" | "error";
  content: ContentBlock[];
  createdAt: string;
  error?: string;
};

export type ConversationState = {
  version: 1;
  messages: Message[];
  canvas: ComponentBlock[];
};

export type StreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "content_block"; block: ComponentBlock | CanvasUpdateBlock }
  | { type: "error"; message: string }
  | { type: "complete" };
