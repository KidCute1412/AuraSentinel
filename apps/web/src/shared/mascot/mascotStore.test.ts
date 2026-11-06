import { beforeEach, describe, expect, it, vi } from "vitest";
import { react, resetMascot, say, toggleShades, touch, useMascot } from "./mascotStore";

describe("mascot store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMascot();
  });

  it("returns to idle after the hold time", () => {
    react("happy", { hold: 500 });
    expect(useMascot.getState().mood).toBe("happy");
    vi.advanceTimersByTime(501);
    expect(useMascot.getState().mood).toBe("idle");
  });

  it("ignores passive feed reactions while a sticky mood is active", () => {
    react("sleep", { hold: 0 });
    react("alarm", { passive: true });
    expect(useMascot.getState().mood).toBe("sleep");
  });

  it("wakes on user input and says so", () => {
    react("sleep", { hold: 0 });
    touch();
    expect(useMascot.getState().mood).toBe("idle");
    expect(useMascot.getState().line?.text).toBe("i'm up. i'm up.");
  });

  it("throttles passive lines but not forced ones", () => {
    say("one");
    say("two");
    expect(useMascot.getState().line?.text).toBe("one");
    say("three", true);
    expect(useMascot.getState().line?.text).toBe("three");
  });

  it("toggles shades", () => {
    toggleShades();
    expect(useMascot.getState().shades).toBe(true);
    toggleShades();
    expect(useMascot.getState().shades).toBe(false);
  });
});
