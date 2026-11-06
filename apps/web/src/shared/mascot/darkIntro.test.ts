import { describe, expect, it } from "vitest";
import { shouldShowDarkIntro } from "./darkIntro";

describe("shouldShowDarkIntro", () => {
  it("shows once in dark mode", () => {
    expect(shouldShowDarkIntro("dark", false)).toBe(true);
  });
  it("never repeats", () => {
    expect(shouldShowDarkIntro("dark", true)).toBe(false);
  });
  it("never shows in light mode", () => {
    expect(shouldShowDarkIntro("light", false)).toBe(false);
  });
});
