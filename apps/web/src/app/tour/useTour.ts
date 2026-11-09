import { useCallback, useEffect, useReducer, useRef } from "react";
import { initialTourState, readSeen, tourReducer, writeSeen, type TourAction } from "./tourLogic";
import type { TourStep } from "./tourSteps";

export interface UseTourOptions {
  storageKey: string;
  /** Open by itself on the first visit (until finished or skipped once). */
  autoStart?: boolean;
  /** Wait for the page layout before the first auto start. */
  autoStartDelayMs?: number;
}

export interface TourControls {
  steps: readonly TourStep[];
  open: boolean;
  index: number;
  step: TourStep | null;
  start: () => void;
  next: () => void;
  prev: () => void;
  close: () => void;
}

export function useTour(steps: readonly TourStep[], { storageKey, autoStart = true, autoStartDelayMs = 400 }: UseTourOptions): TourControls {
  const [state, dispatchRaw] = useReducer((s: typeof initialTourState, a: TourAction) => tourReducer(s, a, steps.length), initialTourState);
  const wasOpen = useRef(false);

  // Finishing or skipping both count as "seen".
  useEffect(() => {
    if (wasOpen.current && !state.open) writeSeen(storageKey);
    wasOpen.current = state.open;
  }, [state.open, storageKey]);

  useEffect(() => {
    if (!autoStart || readSeen(storageKey)) return;
    const t = setTimeout(() => dispatchRaw({ type: "start" }), autoStartDelayMs);
    return () => clearTimeout(t);
  }, [autoStart, autoStartDelayMs, storageKey]);

  const start = useCallback(() => dispatchRaw({ type: "start" }), []);
  const next = useCallback(() => dispatchRaw({ type: "next" }), []);
  const prev = useCallback(() => dispatchRaw({ type: "prev" }), []);
  const close = useCallback(() => dispatchRaw({ type: "close" }), []);

  return {
    steps,
    open: state.open,
    index: state.index,
    step: state.open ? (steps[state.index] ?? null) : null,
    start,
    next,
    prev,
    close,
  };
}
