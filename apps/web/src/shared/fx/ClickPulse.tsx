import { useEffect } from "react";

const SIZE = 28;
const LIFE_MS = 260;

/** Global click feedback: a square outline that grows and fades at the pointer (red on danger controls). */
export function ClickPulse() {
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType !== "mouse" || !mq.matches) return;
      const danger = e.target instanceof Element && e.target.closest('[data-cursor="danger"]') !== null;
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      el.className = `click-pulse pointer-events-none fixed z-[70] border-2 ${danger ? "border-danger" : "border-accent"}`;
      el.style.cssText = `left:${e.clientX - SIZE / 2}px;top:${e.clientY - SIZE / 2}px;width:${SIZE}px;height:${SIZE}px`;
      document.body.appendChild(el);
      window.setTimeout(() => el.remove(), LIFE_MS + 60);
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}
