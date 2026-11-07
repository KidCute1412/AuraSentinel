import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { Chamfer } from "@/shared/ui/Chamfer";
import { AuraKun } from "./AuraKun";
import { eyesLocked, lookAt } from "./eyes";
import { LINES, pick } from "./lines";
import { findGroundBelow, stepFall, type Body, type Ground } from "./physics";
import { react, touch, useMascot } from "./mascotStore";

const SIZE = 96;
/** Feet sit this far below the top of the SVG box. */
const FEET = 84;
const FLOOR_PAD = 10;
const HARD_FALL_PX = 420;
const DRAG_THRESHOLD_PX = 8;

type Anchor = { kind: "ground"; id: string; fx: number } | { kind: "viewport"; xf: number };

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const floorY = () => window.innerHeight - FLOOR_PAD;
const groundEl = (id: string) => document.querySelector<HTMLElement>(`[data-ground="${id}"]`);

/** Everything with data-ground that is currently on screen and wide enough to stand on. */
function collectGrounds(): Ground[] {
  const out: Ground[] = [];
  document.querySelectorAll<HTMLElement>("[data-ground]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 48 || r.top < 64 || r.top > window.innerHeight) return;
    out.push({ id: el.dataset.ground ?? "", left: r.left, right: r.right, top: r.top });
  });
  return out;
}

function resolve(a: Anchor): { x: number; y: number } | null {
  if (a.kind === "viewport") return { x: clamp(a.xf * window.innerWidth, SIZE / 2, window.innerWidth - SIZE / 2), y: floorY() };
  const el = groundEl(a.id);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + a.fx * r.width, y: r.top };
}

interface DragState {
  pointerId: number;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  moved: boolean;
  samples: { t: number; x: number; y: number }[];
}

/**
 * The one Aura-kun for the whole app. It lives above the router, so it follows you from page to page.
 * Drag it anywhere; on release it falls and lands on the nearest `data-ground` element (or the bottom
 * of the screen). Positions are stored as "which element, how far along it", so scrolling and resizing
 * keep it standing in the right place.
 */
export function AuraLayer() {
  const hidden = useMascot((s) => s.hidden);
  const mood = useMascot((s) => s.mood);
  const shades = useMascot((s) => s.shades);
  const line = useMascot((s) => s.line);
  const { pathname } = useLocation();

  const [blinking, setBlinking] = useState(false);
  const [side, setSide] = useState<"left" | "right">("left");
  const [dragging, setDragging] = useState(false);
  const [squash, setSquash] = useState(0);

  const boxRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: -999, y: -999 });
  const anchor = useRef<Anchor | null>(null);
  const mode = useRef<"rest" | "drag" | "fall">("rest");
  const raf = useRef(0);
  const drag = useRef<DragState | null>(null);
  const swallowClick = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const helloTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pokes = useRef<number[]>([]);
  const fallFromY = useRef(0);

  /**
   * (x, y) is the feet point in viewport pixels. "doc" pins Aura-kun to the page (position: absolute),
   * so the browser scrolls it with the content and there is no JS lag, hence no jitter. "viewport"
   * (position: fixed) is used while dragging/falling and when standing on the screen floor.
   */
  const place = (x: number, y: number, space: "viewport" | "doc" = "viewport") => {
    pos.current = { x, y };
    const el = boxRef.current;
    if (el) {
      const ox = space === "doc" ? window.scrollX : 0;
      const oy = space === "doc" ? window.scrollY : 0;
      el.style.position = space === "doc" ? "absolute" : "fixed";
      el.style.transform = `translate3d(${Math.round(x - SIZE / 2 + ox)}px, ${Math.round(y - FEET + oy)}px, 0)`;
    }
    const s = x < 230 ? "right" : "left";
    setSide((p) => (p === s ? p : s));
  };

  /** Current feet point, read from the DOM (the page may have scrolled since the last place()). */
  const feet = () => {
    const r = boxRef.current?.getBoundingClientRect();
    return r ? { x: r.left + SIZE / 2, y: r.top + FEET } : pos.current;
  };

  const settle = (x: number, y: number, id: string | null) => {
    mode.current = "rest";
    const el = id ? groundEl(id) : null;
    if (id && el) {
      const r = el.getBoundingClientRect();
      anchor.current = { kind: "ground", id, fx: clamp((x - r.left) / r.width, 0.04, 0.96) };
    } else {
      anchor.current = { kind: "viewport", xf: clamp(x / window.innerWidth, 0.06, 0.94) };
    }
    place(x, y, anchor.current.kind === "ground" ? "doc" : "viewport");
    setSquash((n) => n + 1);
    const fell = y - fallFromY.current;
    if (fell > HARD_FALL_PX && !reduced()) react("stunned", { text: LINES.hard, hold: 1400 });
    else react("happy", { text: pick(LINES.land), hold: 700 });
  };

  const startFall = (vx: number, vy: number) => {
    const f = feet();
    place(f.x, f.y);
    if (reduced()) {
      const l = findGroundBelow(f.x, f.y, collectGrounds(), floorY());
      settle(f.x, l.y, l.id);
      return;
    }
    mode.current = "fall";
    fallFromY.current = f.y;
    let body: Body = { x: f.x, y: f.y, vx, vy, bounces: 0 };
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const r = stepFall(
        body,
        collectGrounds(),
        floorY(),
        { minX: SIZE / 2, maxX: window.innerWidth - SIZE / 2 },
        dt,
      );
      body = r.body;
      place(body.x, body.y);
      if (r.landed) settle(body.x, r.landed.y, r.landed.id);
      else raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  // Keep Aura-kun standing in the right spot on scroll, resize and layout changes.
  useEffect(() => {
    if (hidden) return;
    if (!anchor.current) {
      anchor.current = groundEl("hero-feed")
        ? { kind: "ground", id: "hero-feed", fx: 0.78 }
        : { kind: "viewport", xf: 0.92 };
    }
    let layoutTick = false;
    let scrollTick = false;
    /** Ground scrolled out of view: follow the person down to the bottom of the screen. */
    const follow = (r: { x: number; y: number }) => {
      if (anchor.current?.kind !== "ground" || (r.y >= 64 && r.y <= window.innerHeight)) return false;
      anchor.current = { kind: "viewport", xf: clamp(r.x / window.innerWidth, 0.08, 0.92) };
      const v = resolve(anchor.current);
      if (v) place(v.x, v.y);
      react("hop", { hold: 350 });
      return true;
    };
    // Layout changes (resize, content shifts): recompute where the anchor is.
    const syncLayout = () => {
      layoutTick = false;
      if (mode.current !== "rest" || !anchor.current) return;
      const r = resolve(anchor.current);
      if (!r) {
        startFall(0, 0);
        return;
      }
      if (follow(r)) return;
      place(r.x, r.y, anchor.current.kind === "ground" ? "doc" : "viewport");
    };
    // Scrolling: the browser moves a page-pinned Aura-kun itself. We only check whether to hand over.
    const syncScroll = () => {
      scrollTick = false;
      if (mode.current !== "rest" || anchor.current?.kind !== "ground") return;
      const r = resolve(anchor.current);
      if (r) follow(r);
    };
    const reqLayout = () => {
      if (!layoutTick) {
        layoutTick = true;
        requestAnimationFrame(syncLayout);
      }
    };
    const reqScroll = () => {
      if (!scrollTick) {
        scrollTick = true;
        requestAnimationFrame(syncScroll);
      }
    };
    window.addEventListener("scroll", reqScroll, { passive: true });
    window.addEventListener("resize", reqLayout);
    const ro = new ResizeObserver(reqLayout);
    ro.observe(document.body);
    reqLayout();
    return () => {
      window.removeEventListener("scroll", reqScroll);
      window.removeEventListener("resize", reqLayout);
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  // New page: if the ground it stood on is gone, it drops to wherever is below.
  useEffect(() => {
    if (hidden) return;
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => {
        const an = anchor.current;
        if (an?.kind === "ground" && !groundEl(an.id) && mode.current === "rest") startFall(0, 0);
      });
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hidden]);

  useEffect(() => () => clearTimeout(helloTimer.current), []);

  // Random blink every 3-6s.
  useEffect(() => {
    if (hidden) return;
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
  }, [hidden]);

  // Eyes follow the pointer (off with reduced motion).
  useEffect(() => {
    if (hidden || reduced()) return;
    const onMove = (e: PointerEvent) => {
      if (!eyesLocked()) lookAt(e.clientX, e.clientY);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [hidden]);

  const cancelHold = () => clearTimeout(holdTimer.current);

  // Rest the pointer on Aura-kun for a moment and it waves back.
  const onPointerEnter = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(helloTimer.current);
    helloTimer.current = setTimeout(() => {
      if (mode.current === "rest" && useMascot.getState().mood === "idle") {
        react("wave", { text: LINES.hello, hold: 1400, passive: true });
      }
    }, 1500);
  };
  const onPointerLeave = () => {
    clearTimeout(helloTimer.current);
    if (useMascot.getState().mood === "wave") react("idle", { hold: 0 });
  };
  const onDoubleClick = () => react("spin", { text: LINES.spin, hold: 700 });

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    touch();
    clearTimeout(helloTimer.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    const f = feet();
    drag.current = {
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ox: f.x - e.clientX,
      oy: f.y - e.clientY,
      moved: false,
      samples: [],
    };
    swallowClick.current = false;
    holdTimer.current = setTimeout(() => {
      if (drag.current && !drag.current.moved) {
        swallowClick.current = true;
        react("hug", { text: LINES.hug, hold: 1400 });
      }
    }, 550);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_THRESHOLD_PX) return;
      d.moved = true;
      cancelHold();
      cancelAnimationFrame(raf.current);
      mode.current = "drag";
      const f = feet();
      place(f.x, f.y); // switch to fixed positioning for the drag
      fallFromY.current = f.y;
      setDragging(true);
      react("whoa", { text: pick(LINES.pickup), hold: 0 });
    }
    const x = clamp(e.clientX + d.ox, SIZE / 2, window.innerWidth - SIZE / 2);
    const y = clamp(e.clientY + d.oy, FEET, window.innerHeight + 40);
    const now = performance.now();
    d.samples = [...d.samples.filter((s) => now - s.t < 100), { t: now, x, y }];
    place(x, y);
  };

  const endPointer = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    cancelHold();
    drag.current = null;
    if (!d.moved) return;
    swallowClick.current = true;
    setDragging(false);
    const a = d.samples[0];
    const b = d.samples[d.samples.length - 1];
    let vx = 0;
    let vy = 0;
    if (a && b && b.t > a.t) {
      vx = clamp(((b.x - a.x) / (b.t - a.t)) * 1000, -1400, 1400);
      vy = clamp(((b.y - a.y) / (b.t - a.t)) * 1000, -1400, 1400);
    }
    startFall(vx, vy);
  };

  const onClick = () => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    const now = Date.now();
    pokes.current = [...pokes.current.filter((t) => now - t < 4000), now];
    if (pokes.current.length >= 5) {
      pokes.current = [];
      react("annoyed", { text: LINES.annoyed, hold: 2500 });
    } else {
      react("hop", { text: pick(LINES.poke), hold: 350 });
    }
  };

  if (hidden) return null;

  const btnStyle: CSSProperties = {
    WebkitTouchCallout: "none",
    touchAction: "none",
    cursor: dragging ? "grabbing" : "grab",
  };
  const bubblePos = side === "left" ? "right-full top-2 mr-1" : "left-full top-2 ml-1";

  return (
    <div
      ref={boxRef}
      data-aura-self
      className={`pointer-events-none fixed left-0 top-0 ${dragging ? "z-[45]" : "z-[35]"}`}
      style={{ width: SIZE, height: SIZE, transform: "translate3d(-999px,-999px,0)", willChange: "transform" }}
    >
      <div key={squash} className={squash ? "mk-squash size-full" : "size-full"}>
        <button
          type="button"
          aria-label="Aura-kun, the mascot. Tap to poke, hold to hug, drag to move."
          className="pointer-events-auto block size-full select-none"
          style={btnStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onContextMenu={(e) => e.preventDefault()}
        >
          <AuraKun mood={mood} shades={shades} blinking={blinking} className="size-full" />
        </button>
      </div>
      {line && (
        <div
          key={line.id}
          aria-hidden
          className={`animate-feed-in pointer-events-none absolute z-10 w-max max-w-[11rem] ${bubblePos}`}
        >
          <Chamfer innerClassName="px-3 py-2 font-mono text-xs text-fg">{line.text}</Chamfer>
        </div>
      )}
      <div role="status" className="sr-only">{line?.text}</div>
    </div>
  );
}
