import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StickyColumn } from "./StickyColumn";

/** jsdom has no layout: fake the column height and a ResizeObserver that measures once. */
function withHeight(px: number) {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(px);
}

describe("StickyColumn", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    window.innerHeight = 900;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sticks under the header while it fits on the screen", () => {
    withHeight(600);
    render(<StickyColumn label="col">x</StickyColumn>);
    expect(screen.getByLabelText("col").className).toMatch(/lg:sticky lg:top-20/);
  });

  it("scrolls with the page when taller than the screen, so its bottom is never hidden", () => {
    withHeight(820);
    render(<StickyColumn label="col" offset="app">x</StickyColumn>);
    expect(screen.getByLabelText("col").className).not.toMatch(/sticky/);
  });

  it("uses the header + app bar offset on vault pages", () => {
    withHeight(400);
    render(<StickyColumn label="col" offset="app" as="aside">x</StickyColumn>);
    const el = screen.getByLabelText("col");
    expect(el.tagName).toBe("ASIDE");
    expect(el.className).toMatch(/lg:top-32/);
  });
});
