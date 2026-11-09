import { describe, expect, it } from "vitest";
import { holeRects, initialTourState, placeCard, readSeen, tourReducer, unionRect, writeSeen, type TourAction, type TourState } from "./tourLogic";

const run = (actions: TourAction[], n = 6, from: TourState = initialTourState) => actions.reduce((s, a) => tourReducer(s, a, n), from);

describe("tourReducer", () => {
  it("starts at step 1 and walks forward", () => {
    expect(run([{ type: "start" }])).toEqual({ open: true, index: 0 });
    expect(run([{ type: "start" }, { type: "next" }, { type: "next" }])).toEqual({ open: true, index: 2 });
  });

  it("finishes (closes) on next from the last step", () => {
    const atLast = run([{ type: "start" }, { type: "goto", index: 5 }]);
    expect(atLast).toEqual({ open: true, index: 5 });
    expect(tourReducer(atLast, { type: "next" }, 6)).toEqual({ open: false, index: 0 });
  });

  it("does not go before the first step", () => {
    expect(run([{ type: "start" }, { type: "prev" }])).toEqual({ open: true, index: 0 });
  });

  it("closes from any step and restarts from step 1", () => {
    const closed = run([{ type: "start" }, { type: "next" }, { type: "close" }]);
    expect(closed.open).toBe(false);
    expect(tourReducer(closed, { type: "start" }, 6)).toEqual({ open: true, index: 0 });
  });

  it("ignores navigation while closed and clamps goto", () => {
    expect(run([{ type: "next" }, { type: "prev" }, { type: "goto", index: 3 }])).toEqual(initialTourState);
    expect(run([{ type: "start" }, { type: "goto", index: 99 }])).toEqual({ open: true, index: 5 });
  });

  it("never opens with zero steps", () => {
    expect(run([{ type: "start" }], 0)).toEqual({ open: false, index: 0 });
  });
});

describe("layout math", () => {
  it("unions all elements sharing an anchor and skips invisible ones", () => {
    expect(
      unionRect([
        { top: 100, left: 20, width: 200, height: 50 },
        { top: 160, left: 20, width: 220, height: 40 },
        { top: 0, left: 0, width: 0, height: 0 },
      ]),
    ).toEqual({ top: 100, left: 20, width: 220, height: 100 });
    expect(unionRect([])).toBeNull();
  });

  it("dims everything except the hole", () => {
    const vp = { width: 1000, height: 800 };
    const [top, bottom, left, right] = holeRects({ top: 100, left: 200, width: 300, height: 50 }, vp);
    expect(top).toEqual({ top: 0, left: 0, width: 1000, height: 100 });
    expect(bottom).toEqual({ top: 150, left: 0, width: 1000, height: 650 });
    expect(left).toEqual({ top: 100, left: 0, width: 200, height: 50 });
    expect(right).toEqual({ top: 100, left: 500, width: 500, height: 50 });
  });

  it("clips the hole to the viewport when the anchor is partly off screen", () => {
    const [top, bottom] = holeRects({ top: -40, left: 0, width: 100, height: 100 }, { width: 400, height: 300 });
    expect(top!.height).toBe(0);
    expect(bottom).toEqual({ top: 60, left: 0, width: 400, height: 240 });
  });

  const card = { width: 384, height: 260 };

  it("uses a bottom sheet on phones (375px)", () => {
    expect(placeCard({ top: 100, left: 16, width: 343, height: 80 }, card, { width: 375, height: 812 })).toEqual({ mode: "sheet" });
  });

  it("centers when there is no anchor", () => {
    expect(placeCard(null, card, { width: 1280, height: 900 })).toEqual({ mode: "center" });
  });

  it("goes below the anchor when it fits, else above", () => {
    const vp = { width: 1280, height: 900 };
    expect(placeCard({ top: 150, left: 100, width: 300, height: 80 }, card, vp)).toEqual({ mode: "float", top: 242, left: 100, side: "below" });
    expect(placeCard({ top: 600, left: 100, width: 300, height: 120 }, card, vp)).toEqual({ mode: "float", top: 328, left: 100, side: "above" });
  });

  it("keeps the card inside the viewport horizontally", () => {
    const p = placeCard({ top: 150, left: 1100, width: 160, height: 60 }, card, { width: 1280, height: 900 });
    expect(p).toMatchObject({ mode: "float", left: 1280 - 384 - 16 });
  });
});

describe("seen flag", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("round-trips", () => {
    const s = store();
    expect(readSeen("k", s)).toBe(false);
    writeSeen("k", s);
    expect(readSeen("k", s)).toBe(true);
  });

  it("survives storage that throws (private mode)", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(readSeen("k", broken)).toBe(false);
    expect(() => writeSeen("k", broken)).not.toThrow();
  });
});
