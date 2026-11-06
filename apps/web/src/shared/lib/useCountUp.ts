import { useEffect, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Counts 0 -> target once `active` is true (ease-out cubic). Jumps straight to target under reduced motion.
 * Integer output only: format units (ms -> s) at the call site.
 */
export function useCountUp(target: number, ms = 600, active = true): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    if (!active) return;
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced, active]);
  return value;
}
