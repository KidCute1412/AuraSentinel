import { useEffect, useState } from "react";

/**
 * Whole seconds left until `untilMs` (epoch ms), ticking once a second; 0 when there is no
 * deadline or it has passed. Used for the 429 Retry-After countdown on the red-team buttons.
 */
export function useCountdown(untilMs: number | null): number {
  const left = () => (untilMs === null ? 0 : Math.max(0, Math.ceil((untilMs - Date.now()) / 1000)));
  const [seconds, setSeconds] = useState(left);

  useEffect(() => {
    setSeconds(left());
    if (untilMs === null) return;
    const t = setInterval(() => {
      const s = left();
      setSeconds(s);
      if (s === 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
    // `left` only reads untilMs, so untilMs is the only dependency.
  }, [untilMs]);

  return seconds;
}
