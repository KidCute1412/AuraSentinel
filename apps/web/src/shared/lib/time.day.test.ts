import { describe, expect, it } from "vitest";
import { dayLabel, groupByDay } from "./time";

const NOW = new Date(2026, 10, 18, 15, 0, 0).getTime(); // Wed, Nov 18 2026, local time
const at = (d: number, h = 12) => new Date(2026, 10, d, h, 0, 0).toISOString();

describe("day grouping", () => {
  it("labels today, yesterday, then the date", () => {
    expect(dayLabel(at(18, 1), NOW)).toBe("Today");
    expect(dayLabel(at(17, 23), NOW)).toBe("Yesterday");
    expect(dayLabel(at(16), NOW)).toBe("Mon, Nov 16");
  });

  it("groups consecutive jobs of the same day and keeps their order", () => {
    const jobs = [at(18, 14), at(18, 9), at(17), at(16, 20), at(16, 8)].map((createdAt, i) => ({ id: i, createdAt }));
    const groups = groupByDay(jobs, NOW);
    expect(groups.map((g) => [g.label, g.items.map((j) => j.id)])).toEqual([
      ["Today", [0, 1]],
      ["Yesterday", [2]],
      ["Mon, Nov 16", [3, 4]],
    ]);
  });
});
