import { flushSync } from "react-dom";

type Transitioning = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

/**
 * Runs `change` inside a View Transition so the new theme grows as a circle from `origin`.
 * Falls back to an instant change when unsupported or when the user prefers reduced motion.
 */
export function revealFrom(origin: HTMLElement, change: () => void): void {
  const doc = document as Transitioning;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduced) {
    change();
    return;
  }
  const r = origin.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const root = document.documentElement.style;
  root.setProperty("--vt-x", `${x}px`);
  root.setProperty("--vt-y", `${y}px`);
  root.setProperty("--vt-r", `${Math.ceil(radius)}px`);
  doc.startViewTransition(() => flushSync(change)).finished.finally(() => {
    root.removeProperty("--vt-x");
    root.removeProperty("--vt-y");
    root.removeProperty("--vt-r");
  });
}
