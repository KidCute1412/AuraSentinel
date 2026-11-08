/** Pure tour logic: state machine, layout math, "seen" flag. No React, no DOM queries. */

export interface TourState {
  open: boolean;
  index: number;
}

export type TourAction =
  | { type: "start" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "goto"; index: number }
  | { type: "close" };

export const initialTourState: TourState = { open: false, index: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** "next" on the last step closes the tour (finish). "close" covers skip, Esc and finish. */
export function tourReducer(state: TourState, action: TourAction, stepCount: number): TourState {
  const last = Math.max(0, stepCount - 1);
  switch (action.type) {
    case "start":
      return { open: stepCount > 0, index: 0 };
    case "next":
      if (!state.open) return state;
      return state.index >= last ? { open: false, index: 0 } : { ...state, index: state.index + 1 };
    case "prev":
      return state.open ? { ...state, index: Math.max(0, state.index - 1) } : state;
    case "goto":
      return state.open ? { ...state, index: clamp(action.index, 0, last) } : state;
    case "close":
      return { open: false, index: 0 };
  }
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Smallest rect covering all of them (several elements may share one anchor). Null when empty. */
export function unionRect(rects: readonly Rect[]): Rect | null {
  const visible = rects.filter((r) => r.width > 0 || r.height > 0);
  if (visible.length === 0) return null;
  const top = Math.min(...visible.map((r) => r.top));
  const left = Math.min(...visible.map((r) => r.left));
  const bottom = Math.max(...visible.map((r) => r.top + r.height));
  const right = Math.max(...visible.map((r) => r.left + r.width));
  return { top, left, width: right - left, height: bottom - top };
}

/** Grows a rect by `pad` on every side (room for the highlight frame). */
export const padRect = (r: Rect, pad: number): Rect => ({
  top: r.top - pad,
  left: r.left - pad,
  width: r.width + pad * 2,
  height: r.height + pad * 2,
});

/** Four dimming panels around the highlighted hole, clipped to the viewport. */
export function holeRects(hole: Rect, vp: Size): Rect[] {
  const top = clamp(hole.top, 0, vp.height);
  const bottom = clamp(hole.top + hole.height, 0, vp.height);
  const left = clamp(hole.left, 0, vp.width);
  const right = clamp(hole.left + hole.width, 0, vp.width);
  return [
    { top: 0, left: 0, width: vp.width, height: top },
    { top: bottom, left: 0, width: vp.width, height: vp.height - bottom },
    { top, left: 0, width: left, height: bottom - top },
    { top, left: right, width: vp.width - right, height: bottom - top },
  ];
}

export type Placement =
  | { mode: "sheet" }
  | { mode: "center" }
  | { mode: "float"; top: number; left: number; side: "below" | "above" };

export const SHEET_BREAKPOINT = 640;

/**
 * Where the step card goes. Phones get a bottom sheet; no anchor means centered; otherwise
 * below the anchor if it fits, else above, else below clamped into the viewport.
 */
export function placeCard(anchor: Rect | null, card: Size, vp: Size, gap = 12, margin = 16): Placement {
  if (vp.width < SHEET_BREAKPOINT) return { mode: "sheet" };
  if (!anchor) return { mode: "center" };
  const left = clamp(anchor.left, margin, vp.width - card.width - margin);
  const below = anchor.top + anchor.height + gap;
  if (below + card.height <= vp.height - margin) return { mode: "float", top: below, left, side: "below" };
  const above = anchor.top - gap - card.height;
  if (above >= margin) return { mode: "float", top: above, left, side: "above" };
  return { mode: "float", top: clamp(below, margin, vp.height - card.height - margin), left, side: "below" };
}

/** Storage can be missing or throw (private mode, blocked site data): never let that break the page. */
export function readSeen(key: string, storage: Pick<Storage, "getItem"> | undefined = safeLocalStorage()): boolean {
  try {
    return storage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeSeen(key: string, storage: Pick<Storage, "setItem"> | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(key, "1");
  } catch {
    // Not remembered; the tour will offer itself again next visit.
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
