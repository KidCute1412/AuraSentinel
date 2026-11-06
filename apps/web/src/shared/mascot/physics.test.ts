import { describe, expect, it } from "vitest";
import { findGroundBelow, stepFall, type Body, type Ground } from "./physics";

const bounds = { minX: 48, maxX: 952 };
const card: Ground = { id: "card", left: 200, right: 600, top: 400 };

function simulate(start: Body, grounds: Ground[], floor = 800) {
  let b = start;
  for (let i = 0; i < 600; i++) {
    const r = stepFall(b, grounds, floor, bounds, 1 / 60);
    b = r.body;
    if (r.landed) return r.landed;
  }
  throw new Error("never landed");
}

describe("stepFall", () => {
  it("lands on the first ground below", () => {
    expect(simulate({ x: 300, y: 100, vx: 0, vy: 0, bounces: 0 }, [card])).toEqual({ y: 400, id: "card" });
  });
  it("misses a ground it is not above and reaches the floor", () => {
    expect(simulate({ x: 700, y: 100, vx: 0, vy: 0, bounces: 0 }, [card])).toEqual({ y: 800, id: null });
  });
  it("does not land on a ground that is already above the feet", () => {
    expect(simulate({ x: 300, y: 500, vx: 0, vy: 0, bounces: 0 }, [card])).toEqual({ y: 800, id: null });
  });
  it("bounces once on a hard impact before settling", () => {
    let b: Body = { x: 300, y: 100, vx: 0, vy: 0, bounces: 0 };
    let bounced = false;
    for (let i = 0; i < 600; i++) {
      const r = stepFall(b, [card], 800, bounds, 1 / 60);
      if (r.body.bounces === 1 && r.body.vy < 0) bounced = true;
      b = r.body;
      if (r.landed) break;
    }
    expect(bounced).toBe(true);
  });
  it("is stopped by the side walls", () => {
    const r = stepFall({ x: 950, y: 100, vx: 3000, vy: 0, bounces: 0 }, [], 800, bounds, 1 / 60);
    expect(r.body.x).toBe(952);
  });
});

describe("findGroundBelow", () => {
  it("picks the nearest ground below, else the floor", () => {
    expect(findGroundBelow(300, 100, [card], 800)).toEqual({ y: 400, id: "card" });
    expect(findGroundBelow(900, 100, [card], 800)).toEqual({ y: 800, id: null });
  });
});
