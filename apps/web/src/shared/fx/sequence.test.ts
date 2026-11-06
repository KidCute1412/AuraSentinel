import { describe, expect, it } from "vitest";
import { createMatcher, isEditable, KILL } from "./sequence";

const feed = (m: ReturnType<typeof createMatcher>, keys: string[]) => keys.map((k) => m.push(k));

describe("createMatcher", () => {
  it("completes 'kill' regardless of case", () => {
    const m = createMatcher([KILL]);
    const out = feed(m, ["K", "i", "L", "l"]);
    expect(out.pop()).toBe(0);
    expect(out.every((r) => r === -1)).toBe(true);
  });

  it("resets on a wrong key", () => {
    const m = createMatcher([KILL]);
    feed(m, ["k", "i", "x"]);
    expect(feed(m, ["l", "l"]).pop()).toBe(-1);
  });

  it("treats a wrong key that equals the first key as a restart", () => {
    const m = createMatcher([KILL]);
    expect(feed(m, ["k", "k", "i", "l", "l"]).pop()).toBe(0);
  });

  it("can fire repeatedly", () => {
    const m = createMatcher([KILL]);
    feed(m, KILL);
    expect(feed(m, KILL).pop()).toBe(0);
  });
});

describe("isEditable", () => {
  it("is true for form fields and contenteditable", () => {
    expect(isEditable(document.createElement("input"))).toBe(true);
    expect(isEditable(document.createElement("textarea"))).toBe(true);
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isEditable(div)).toBe(true);
  });

  it("is false for other elements and null", () => {
    expect(isEditable(document.createElement("button"))).toBe(false);
    expect(isEditable(null)).toBe(false);
  });
});
