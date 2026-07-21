import { describe, expect, it } from "vitest";
import { chatRequestSchema, componentBlockSchema } from "./schemas";

describe("boundary schemas", () => {
  it("accepts a registered component and rejects executable component names", () => {
    expect(componentBlockSchema.safeParse({ type: "component", component: "note", props: {} }).success).toBe(true);
    expect(componentBlockSchema.safeParse({ type: "component", component: "script", props: {} }).success).toBe(false);
  });

  it("rejects empty chat messages", () => {
    expect(chatRequestSchema.safeParse({ messages: [{ role: "user", content: "" }] }).success).toBe(false);
  });
});
