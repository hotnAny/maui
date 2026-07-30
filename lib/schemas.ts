import { z } from "zod";

export const componentBlockSchema = z.object({
  type: z.literal("component"),
  component: z.enum(["stat", "table", "note"]),
  props: z.record(z.string(), z.unknown()),
  fallback: z.string().optional(),
});

export const canvasUpdateSchema = z.object({
  type: z.literal("canvas_update"),
  action: z.enum(["replace", "append", "clear"]),
  panels: z.array(componentBlockSchema).optional(),
});

export const agentRequestSchema = z.object({
  agent: z.string().regex(/^[\w-]+$/),
  state: z.string().nullable(),
  channel: z.enum(["chat", "ui"]),
  trigger: z
    .object({ name: z.string(), payload: z.record(z.string(), z.unknown()).default({}) })
    .optional(),
  message: z.string().max(2_000).optional(),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(30_000),
      }),
    )
    .min(1)
    .max(100),
});
