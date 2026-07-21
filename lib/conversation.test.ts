import { describe, expect, it } from "vitest";
import { applyCanvasUpdate, textFromContent } from "./conversation";
import type { ComponentBlock } from "./domain";

const panel: ComponentBlock = {
  type: "component",
  component: "stat",
  props: { label: "Items", value: 3 },
};

describe("conversation helpers", () => {
  it("collects only text blocks", () => {
    expect(textFromContent([{ type: "text", text: "Hello" }, panel, { type: "text", text: "world" }])).toBe("Hello\nworld");
  });

  it("applies all canvas update actions without mutating the input", () => {
    const original = [panel];
    expect(applyCanvasUpdate(original, { type: "canvas_update", action: "clear" })).toEqual([]);
    expect(applyCanvasUpdate(original, { type: "canvas_update", action: "replace", panels: [] })).toEqual([]);
    expect(applyCanvasUpdate(original, { type: "canvas_update", action: "append", panels: [panel] })).toHaveLength(2);
    expect(original).toHaveLength(1);
  });
});
