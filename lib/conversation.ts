import type { CanvasUpdateBlock, ComponentBlock, ContentBlock, Message } from "./domain";

export function textFromContent(content: ContentBlock[]) {
  return content
    .filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export function applyCanvasUpdate(canvas: ComponentBlock[], update: CanvasUpdateBlock) {
  if (update.action === "clear") return [];
  if (update.action === "replace") return update.panels ?? [];
  return [...canvas, ...(update.panels ?? [])];
}

export function createMessage(role: Message["role"], text: string, status: Message["status"]): Message {
  return {
    id: crypto.randomUUID(),
    role,
    status,
    content: [{ type: "text", text }],
    createdAt: new Date().toISOString(),
  };
}
