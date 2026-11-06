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

const CX = 160;
const CY = 162;
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
  const [extra, setExtra] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ last: number; total: number } | null>(null);
  const [shaking, setShaking] = useState(false);

  // A short shake every time the stage changes: the bolts "clunk".
  useEffect(() => {
    if (stage > 0 && stage < 3) setShaking(true);
  }, [stage]);

  const angleAt = (e: PointerEvent): number => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return 0;
    const cx = r.left + (CX / 320) * r.width;
    const cy = r.top + (CY / 326) * r.height;
    return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
  };
  const onDown = (e: PointerEvent<SVGGElement>) => {
    if (open) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { last: angleAt(e), total: 0 };
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
    setExtra((x) => x + delta);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d && d.total > 360) onOverspin?.();
  };

  const lamp = (i: number) => (i < stage ? "var(--accent)" : denied && i === stage ? "var(--danger)" : "var(--line)");
  const wheelDeg = stage * 120 + extra;

  return (
    <svg
      ref={svg}
      viewBox="0 0 320 326"
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
          className={cn(!dragging && "gate-move", !open && "cursor-grab touch-none", dragging && "cursor-grabbing")}
          style={{ transform: `rotate(${wheelDeg}deg)`, transformOrigin: `${CX}px ${CY}px`, touchAction: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <circle cx={CX} cy={CY} r="84" fill="var(--bg)" stroke="var(--shadow-color)" strokeWidth="3" />
          <circle cx={CX} cy={CY} r="68" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="2 6" />
          {[0, 60, 120].map((deg) => (
            <rect key={deg} x="154" y="82" width="12" height="160" fill="var(--hover)" stroke="var(--shadow-color)" strokeWidth="2.5" transform={`rotate(${deg} ${CX} ${CY})`} />
          ))}
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <circle key={deg} cx={CX} cy="86" r="5" fill="var(--highlight)" stroke="var(--shadow-color)" strokeWidth="2" transform={`rotate(${deg} ${CX} ${CY})`} />
          ))}
        </g>

        {/* lock */}
        <g pointerEvents="none">
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
