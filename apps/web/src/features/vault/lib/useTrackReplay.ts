import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/shared/lib/useReducedMotion";
import { isSettled, nextPos, settledAt, type TrackPos, type TrackTarget } from "./pipelineMotion";

/**
 * One beat of the walk: how long a gate is checked (its rules print in) before it answers, and the pause between
 * answering and the next gate. Every single motion stays at 200ms (design-system); this is the time between them.
 */
export const STEP_MS = 850;

/** Jobs whose journey already played this session: reopening one shows the end state at once. */
const played = new Set<string>();

/** No animation without a browser that can tell us the motion setting (tests, SSR), or with reduced motion on. */
const canAnimate = () => typeof matchMedia !== "undefined" && !prefersReducedMotion();

/**
 * Where the packet is shown, walking to `target` one beat at a time: a replay the first time a finished job opens,
 * and live steps while a job runs. `playing` = still on its way.
 */
export function useTrackReplay(jobId: string, target: TrackTarget, settled: boolean): { pos: TrackPos; playing: boolean } {
  const [pos, setPos] = useState<TrackPos>(() => (!canAnimate() || played.has(jobId) ? settledAt(target) : { stop: 0, revealed: false }));
  const done = isSettled(pos, target);

  useEffect(() => {
    if (done) {
      if (settled) played.add(jobId);
      return;
    }
    if (!canAnimate()) return void setPos(settledAt(target));
    const t = setTimeout(() => setPos((p) => nextPos(p, target)), STEP_MS);
    return () => clearTimeout(t);
    // `target` is rebuilt every render; its fields are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, done, target.stop, target.bypass, target.blocked, target.halted, settled, jobId]);

  return { pos, playing: !done };
}
