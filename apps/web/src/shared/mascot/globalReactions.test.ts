// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installGlobalReactions } from "./globalReactions";
import { react, resetMascot, useMascot } from "./mascotStore";

describe("data-aura=inspect: hover to have a look", () => {
  let stop: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    resetMascot();
    document.body.innerHTML = `<p data-aura="inspect" data-aura-line="read it." id="a">fine print</p><p id="b">plain</p>`;
    stop = installGlobalReactions();
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  const hover = (id: string) => {
    const el = document.getElementById(id)!;
    const e = new Event("pointerover", { bubbles: true });
    Object.defineProperty(e, "pointerType", { value: "mouse" });
    el.dispatchEvent(e);
  };

  it("leans in and says the element's line, then relaxes when the pointer moves on", () => {
    hover("a");
    expect(useMascot.getState().mood).toBe("inspect");
    expect(useMascot.getState().line?.text).toBe("read it.");
    hover("b");
    expect(useMascot.getState().mood).toBe("idle");
  });

  it("never cuts in on a held mood (hugs, guard...)", () => {
    react("hug", { hold: 0 });
    hover("a");
    expect(useMascot.getState().mood).toBe("hug");
  });
});
