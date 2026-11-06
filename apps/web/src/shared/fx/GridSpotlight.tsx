import { useEffect } from "react";
import { prefersReducedMotion } from "@/shared/lib/useReducedMotion";

const CELL = 32;

/**
 * Lights up the blueprint grid under the cursor. One window listener; it only writes CSS variables
 * on the `.blueprint` field being hovered, the look lives in index.css. Off for touch and reduced motion.
 */
export function GridSpotlight() {
  useEffect(() => {
    if (prefersReducedMotion() || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let active: HTMLElement | null = null;
    let raf = 0;
    let last: PointerEvent | null = null;

    const clear = () => {
      active?.removeAttribute("data-spot");
      active = null;
    };

    const frame = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const field = (e.target as Element | null)?.closest<HTMLElement>(".blueprint") ?? null;
      if (field !== active) clear();
      if (!field) return;
      const r = field.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      field.style.setProperty("--mx", `${x}px`);
      field.style.setProperty("--my", `${y}px`);
      field.style.setProperty("--cx", `${Math.floor(x / CELL) * CELL}px`);
      field.style.setProperty("--cy", `${Math.floor(y / CELL) * CELL}px`);
      field.setAttribute("data-spot", "");
      active = field;
    };

    const onMove = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(frame);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", clear);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", clear);
      cancelAnimationFrame(raf);
      clear();
    };
  }, []);
  return null;
}
