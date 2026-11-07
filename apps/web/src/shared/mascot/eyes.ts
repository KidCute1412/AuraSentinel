/** Eye direction for Aura-kun, shared by the pointer tracker and the "look at that" reactions. */
let lockedUntil = 0;

/** True while a reaction (typing, a dialog opening) owns the eyes, so the pointer tracker backs off. */
export const eyesLocked = (): boolean => Date.now() < lockedUntil;

/** Point the eyes at a viewport coordinate. `lockMs` keeps the pointer from stealing them back. */
export function lookAt(clientX: number, clientY: number, lockMs = 0): void {
  const svg = document.querySelector<SVGSVGElement>("[data-aura-self] svg");
  if (!svg) return;
  const r = svg.getBoundingClientRect();
  const dx = clientX - (r.left + r.width / 2);
  const dy = clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, d / 220);
  svg.style.setProperty("--lx", `${((dx / d) * k * 4).toFixed(1)}px`);
  svg.style.setProperty("--ly", `${((dy / d) * k * 3).toFixed(1)}px`);
  if (lockMs > 0) lockedUntil = Date.now() + lockMs;
}
