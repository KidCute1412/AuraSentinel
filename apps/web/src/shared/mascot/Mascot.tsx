import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Chamfer } from "@/shared/ui/Chamfer";
import { AuraKun } from "./AuraKun";
import { LINES, pick } from "./lines";
import { react, say, setHeroVisible, touch, useMascot } from "./mascotStore";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Everything Aura-kun does on its own or in response to a person, shared by hero and dock. */
function useAura() {
  const mood = useMascot((s) => s.mood);
  const shades = useMascot((s) => s.shades);
  const [blinking, setBlinking] = useState(false);
  const wrapRef = useRef<HTMLButtonElement>(null);
  const pokes = useRef<number[]>([]);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);

  // Random blink every 3-6s while awake.
  useEffect(() => {
    let outer: ReturnType<typeof setTimeout>;
    let inner: ReturnType<typeof setTimeout>;
    const loop = () => {
      outer = setTimeout(() => {
        setBlinking(true);
        inner = setTimeout(() => setBlinking(false), 130);
        loop();
      }, 3000 + Math.random() * 3000);
    };
    loop();
    return () => {
      clearTimeout(outer);
      clearTimeout(inner);
    };
  }, []);

  // Eyes follow the pointer (or last touch). Off when reduced motion is requested.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const onMove = (e: PointerEvent) => {
      const el = wrapRef.current?.querySelector("svg");
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 220);
      el.style.setProperty("--lx", `${((dx / d) * k * 4).toFixed(1)}px`);
      el.style.setProperty("--ly", `${((dy / d) * k * 3).toFixed(1)}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
    };
  }, []);

  const onPointerDown = () => {
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      touch();
      react("hug", { text: LINES.hug, hold: 1400 });
    }, 550);
  };
  const cancelHold = () => clearTimeout(holdTimer.current);

  const onClick = () => {
    if (held.current) {
      held.current = false;
      return;
    }
    touch();
    const now = Date.now();
    pokes.current = [...pokes.current.filter((t) => now - t < 4000), now];
    if (pokes.current.length >= 5) {
      pokes.current = [];
      react("annoyed", { text: LINES.annoyed, hold: 2500 });
    } else {
      react("hop", { text: pick(LINES.poke), hold: 350 });
    }
  };

  const handlers = {
    onPointerDown,
    onPointerUp: cancelHold,
    onPointerLeave: cancelHold,
    onPointerCancel: cancelHold,
    onClick,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
  return { mood, shades, blinking, wrapRef, handlers };
}

function Bubble({ position }: { position: string }) {
  const line = useMascot((s) => s.line);
  if (!line) return null;
  return (
    <div
      key={line.id}
      aria-hidden
      className={`animate-feed-in pointer-events-none absolute z-10 w-max max-w-[11rem] ${position}`}
    >
      <Chamfer innerClassName="px-3 py-2 font-mono text-xs text-fg">{line.text}</Chamfer>
    </div>
  );
}

const BTN: CSSProperties = { WebkitTouchCallout: "none", touchAction: "manipulation" };

/** Large Aura-kun that stands on the live-feed terminal in the hero. */
export function MascotHero() {
  const { mood, shades, blinking, wrapRef, handlers } = useAura();
  const line = useMascot((s) => s.line);
  const heroVisible = useMascot((s) => s.heroVisible);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={box} className={`absolute right-10 top-6 z-10 size-[120px] ${heroVisible ? "" : "invisible"}`}>
      <button
        ref={wrapRef}
        type="button"
        aria-label="Aura-kun, the mascot. Tap to poke, hold to hug."
        className="block size-full select-none"
        style={BTN}
        {...handlers}
      >
        <AuraKun mood={mood} shades={shades} blinking={blinking} className="size-full" />
      </button>
      <Bubble position="right-full top-2 mr-1" />
      <div role="status" className="sr-only">{line?.text}</div>
    </div>
  );
}

/** Small Aura-kun docked bottom-right once the hero scrolls away. */
export function MascotDock() {
  const heroVisible = useMascot((s) => s.heroVisible);
  const { mood, shades, blinking, wrapRef, handlers } = useAura();
  if (heroVisible) return null;
  return (
    <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-30 size-16">
      <button
        ref={wrapRef}
        type="button"
        aria-label="Aura-kun, the mascot. Tap to poke, hold to hug."
        className="block size-full select-none"
        style={BTN}
        {...handlers}
      >
        <AuraKun mood={mood} shades={shades} blinking={blinking} className="size-full" />
      </button>
      <Bubble position="right-full bottom-3 mr-1" />
    </div>
  );
}

export { say };
