import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cn } from "@/shared/lib/cn";

interface GateDoorProps {
  /** 0..3 finished steps. The door unlocks one notch per step and swings open at 3. */
  stage: 0 | 1 | 2 | 3;
  denied?: boolean;
  /** Pulse the lamp of the step that is waiting on the wallet or chain. */
  busy?: boolean;
  /** Called after a drag that turned the wheel more than a full turn. */
  onOverspin?: () => void;
  className?: string;
}

const IDLE_SPEED = 14; // deg/s, the wheel never fully stops
const MAX_SPEED = 1400;
const CX = 160;
const CY = 162;
/** viewBox starts at the frame's top edge so the svg box (the mascot's landing ground) has no empty headroom. */
const VIEW_TOP = 30;
const VIEW_H = 296;
const BOLTS = [78, 154, 230];
const SPARKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const r = 70 + (i % 3) * 22;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
});
const COINS = [
  [96, 250, 3],
  [140, 250, 5],
  [184, 250, 4],
  [228, 250, 2],
];

/** Blueprint vault door. Spin the wheel by hand; every finished step retracts the bolts and the last one swings it open. */
export function GateDoor({ stage, denied, busy, onOverspin, className }: GateDoorProps) {
  const open = stage === 3;
  const svg = useRef<SVGSVGElement>(null);
  const wheel = useRef<SVGGElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  // Wheel physics lives in refs and is painted straight to the DOM: no React render per frame.
  const spin = useRef({ angle: 0, vel: IDLE_SPEED });
  const calm = useRef(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ last: number; lastT: number; total: number } | null>(null);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    calm.current = mq.matches;
    const onChange = () => {
      calm.current = mq.matches;
    };
    mq.addEventListener("change", onChange);
    let raf = 0;
    let prev = performance.now();
    const paint = () => {
      const a = spin.current.angle;
      wheel.current?.setAttribute("transform", `rotate(${a} ${CX} ${CY})`);
      ring.current?.setAttribute("transform", `rotate(${-a * 0.6} ${CX} ${CY})`);
    };
    const tick = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      const st = spin.current;
      if (!drag.current && !calm.current) {
        // ease back to the idle speed: a flick spins down, a stage kick settles
        st.vel += (IDLE_SPEED - st.vel) * (1 - Math.exp(-dt * 1.4));
        st.angle += st.vel * dt;
        paint();
      }
      raf = requestAnimationFrame(tick);
    };
    paint();
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", onChange);
    };
  }, []);

  // Every finished step: the bolts "clunk" (short shake) and the wheel gets a kick.
  useEffect(() => {
    if (stage === 0) return;
    if (stage < 3) setShaking(true);
    if (calm.current) {
      spin.current.angle += 120;
      wheel.current?.setAttribute("transform", `rotate(${spin.current.angle} ${CX} ${CY})`);
    } else {
      spin.current.vel = Math.min(spin.current.vel + 420, MAX_SPEED);
    }
  }, [stage]);

  const angleAt = (e: PointerEvent): number => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return 0;
    const cx = r.left + (CX / 320) * r.width;
    const cy = r.top + ((CY - VIEW_TOP) / VIEW_H) * r.height;
    return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
  };
  const onDown = (e: PointerEvent<SVGGElement>) => {
    if (open) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { last: angleAt(e), lastT: performance.now(), total: 0 };
    spin.current.vel = 0;
    setDragging(true);
  };
  const onMove = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d) return;
    const a = angleAt(e);
    let delta = a - d.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    d.last = a;
    d.total += Math.abs(delta);
    const now = performance.now();
    const dt = Math.max((now - d.lastT) / 1000, 0.001);
    d.lastT = now;
    const st = spin.current;
    st.angle += delta;
    // smoothed finger speed becomes the flick when released
    st.vel = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, st.vel * 0.6 + (delta / dt) * 0.4));
    wheel.current?.setAttribute("transform", `rotate(${st.angle} ${CX} ${CY})`);
    ring.current?.setAttribute("transform", `rotate(${-st.angle * 0.6} ${CX} ${CY})`);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d && d.total > 360) onOverspin?.();
  };

  const lamp = (i: number) => (i < stage ? "var(--accent)" : denied && i === stage ? "var(--danger)" : "var(--line)");

  return (
    <svg
      ref={svg}
      viewBox={`0 ${VIEW_TOP} 320 ${VIEW_H}`}
      role="img"
      aria-label={open ? "Vault door open" : `Vault door, ${stage} of 3 steps done`}
      onAnimationEnd={() => setShaking(false)}
      className={cn("block w-full select-none overflow-visible", shaking && "animate-shake", className)}
    >
      {/* frame + hinges */}
      <polygon points="26,30 280,30 296,46 296,296 40,296 24,280" fill="var(--surface)" stroke="var(--shadow-color)" strokeWidth="3" />
      {[70, 240].map((y) => (
        <rect key={y} x="20" y={y} width="14" height="26" fill="var(--hover)" stroke="var(--shadow-color)" strokeWidth="2.5" />
      ))}

      {/* inside the vault, revealed when the leaf swings */}
      <g>
        <polygon points="42,44 280,44 284,48 284,290 46,290 42,286" fill="var(--tint-mint)" stroke="var(--line-strong)" strokeWidth="1.5" />
        <path d="M42 120H284M42 196H284M120 44V290M200 44V290" stroke="var(--grid)" strokeWidth="1" />
        {COINS.map(([x, y, n]) =>
          Array.from({ length: n }, (_, k) => (
            <rect key={`${x}-${k}`} x={x} y={y - k * 14 - 12} width="36" height="12" fill="var(--accent)" stroke="var(--shadow-color)" strokeWidth="2" />
          )),
        )}
        <text x="162" y="96" textAnchor="middle" className="fill-fg font-mono" fontSize="14" fontWeight="700" letterSpacing="4">VAULT</text>
      </g>

      {/* the door leaf: scales toward the left hinge to fake a swing */}
      <g className="gate-move" style={{ transform: `scaleX(${open ? 0.1 : 1})`, transformOrigin: "40px 162px" }}>
        <polygon points="42,44 280,44 284,48 284,290 46,290 42,286" fill="var(--surface)" stroke="var(--shadow-color)" strokeWidth="3" />
        <polygon points="56,58 268,58 270,60 270,276 58,276 56,274" fill="none" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 4" />
        {BOLTS.map((y) => (
          <rect
            key={y}
            x="258"
            y={y}
            width="30"
            height="16"
            fill="var(--hover)"
            stroke="var(--shadow-color)"
            strokeWidth="2.5"
            className="gate-move"
            style={{ transform: `translateX(${stage >= 2 ? -22 : stage === 1 ? -9 : 0}px)` }}
          />
        ))}

        <g
          ref={wheel}
          className={cn(!open && "cursor-grab touch-none", dragging && "cursor-grabbing")}
          style={{ touchAction: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <circle cx={CX} cy={CY} r="84" fill="var(--bg)" stroke="var(--shadow-color)" strokeWidth="3" />
          <circle ref={ring} cx={CX} cy={CY} r="68" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="2 6" />
          {[0, 60, 120].map((deg) => (
            <rect key={deg} x="154" y="82" width="12" height="160" fill="var(--hover)" stroke="var(--shadow-color)" strokeWidth="2.5" transform={`rotate(${deg} ${CX} ${CY})`} />
          ))}
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <circle key={deg} cx={CX} cy="86" r="5" fill="var(--highlight)" stroke="var(--shadow-color)" strokeWidth="2" transform={`rotate(${deg} ${CX} ${CY})`} />
          ))}
        </g>

        {/* lock */}
        <g pointerEvents="none" className={cn(stage === 0 && !busy && "gate-jiggle")}>
          <path d="M142 150V134a18 18 0 0 1 36 0V150" fill="none" stroke="var(--shadow-color)" strokeWidth="8" />
          <rect x="132" y="148" width="56" height="44" fill={denied ? "var(--danger)" : stage >= 2 ? "var(--accent)" : "var(--highlight)"} stroke="var(--shadow-color)" strokeWidth="3" className="gate-move" />
          {denied ? (
            <path d="M152 160l16 20M168 160l-16 20" stroke="var(--on-accent)" strokeWidth="4" fill="none" />
          ) : stage >= 2 ? (
            <path d="M150 170l8 8 14-16" stroke="var(--on-accent)" strokeWidth="4" fill="none" />
          ) : (
            <>
              <circle cx={CX} cy="166" r="5" fill="var(--on-accent)" />
              <rect x="158" y="168" width="4" height="12" fill="var(--on-accent)" />
            </>
          )}
        </g>

        {[0, 1, 2].map((i) => (
          <rect key={i} x={113 + i * 34} y="250" width="26" height="10" fill={lamp(i)} stroke="var(--shadow-color)" strokeWidth="2" className={cn("gate-move", busy && i === stage && "animate-pulse")} />
        ))}
      </g>

      {open && (
        <g aria-hidden>
          {SPARKS.map((s, i) => (
            <rect key={i} x="276" y="150" width="8" height="8" fill={i % 2 ? "var(--accent)" : "var(--highlight)"} stroke="var(--shadow-color)" strokeWidth="1.5" className="gate-spark" style={{ ["--dx" as string]: `${s.dx - 100}px`, ["--dy" as string]: `${s.dy}px` }} />
          ))}
        </g>
      )}
      <text x="160" y="318" textAnchor="middle" className="fill-muted font-mono" fontSize="9" letterSpacing="3">
        {open ? "ACCESS GRANTED" : denied ? "SIGNATURE REFUSED" : "TURN THE WHEEL"}
      </text>
    </svg>
  );
}
