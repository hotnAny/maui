import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { A2UIRenderer } from "./a2ui-renderer";
import type { Manifest } from "@/lib/agent/manifest";
import { compileSurface } from "@/lib/agent/pattern-compiler";

// A repeated row is the one case where the event name cannot identify the payload: every
// row emits `select_venue`. This walks the whole chain — compile, wire, click.

const manifest = {
  genui: {
    catalog: "test/v1",
    patterns: [
      {
        id: "candidate-list",
        desc: "pick one of several options",
        states: [],
        binds: ["/venues/candidates"],
        layout: [
          "Card #root:",
          "  Column:",
          "    *@/venues/candidates Row #venue:",
          '      Text #name: "{@./name}"',
          '      Button #pick: "Choose" -> event select_venue',
        ].join("\n"),
        events: ["select_venue(id=@./id)"],
        fallback: "candidates available",
      },
    ],
  },
} as unknown as Manifest;

const model = {
  venues: { candidates: [{ id: "v1", name: "the park" }, { id: "v2", name: "the hall" }] },
};

describe("A2UIRenderer — repeated rows", () => {
  it("sends the clicked row's item, not the first row's", () => {
    const surface = compileSurface(manifest, "candidate-list", "main", model);
    const onEvent = vi.fn();
    render(<A2UIRenderer messages={surface.messages} eventBindings={surface.eventBindings} onEvent={onEvent} />);

    expect(screen.getByText("the park")).toBeDefined();
    expect(screen.getByText("the hall")).toBeDefined();

    const buttons = screen.getAllByRole("button", { name: "Choose" });
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[1]);
    expect(onEvent).toHaveBeenCalledWith("select_venue", { id: "v2" });

    fireEvent.click(buttons[0]);
    expect(onEvent).toHaveBeenLastCalledWith("select_venue", { id: "v1" });
  });
});
