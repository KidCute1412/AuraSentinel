import { describe, expect, it } from "vitest";
import { clockTime, timeAgo, timeLeft } from "./time";

const NOW = Date.parse("2026-11-09T12:00:00Z");

describe("clockTime", () => {
  it("prints a 24-hour HH:MM:SS clock and survives a bad timestamp", () => {
    expect(clockTime("2026-11-09T12:00:00Z")).toMatch(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);
    expect(clockTime("not a date")).toBe("--:--:--");
  });
});

describe("timeAgo", () => {
  it("buckets from seconds to days", () => {
    expect(timeAgo("2026-11-09T11:59:58Z", NOW)).toBe("just now");
    expect(timeAgo("2026-11-09T11:59:30Z", NOW)).toBe("30 s ago");
    expect(timeAgo("2026-11-09T11:55:00Z", NOW)).toBe("5 min ago");
    expect(timeAgo("2026-11-09T09:00:00Z", NOW)).toBe("3 h ago");
    expect(timeAgo("2026-11-06T12:00:00Z", NOW)).toBe("3 d ago");
  });

  it("never shows a negative time for clock skew", () => {
    expect(timeAgo("2026-11-09T12:00:30Z", NOW)).toBe("just now");
  });
});

describe("timeLeft", () => {
  const now = NOW / 1000;
  it("rounds sensibly and handles expiry", () => {
    expect(timeLeft(now - 1, now)).toBe("expired");
    expect(timeLeft(now + 90, now)).toBe("2 min");
    expect(timeLeft(now + 7200, now)).toBe("2 h");
    expect(timeLeft(now + 86_400, now)).toBe("1 day");
    expect(timeLeft(now + 30 * 86_400, now)).toBe("30 days");
  });
});
