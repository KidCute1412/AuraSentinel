import { useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface ChamferProps {
  children: ReactNode;
  /** Border color token class, e.g. "bg-line-strong" or "bg-danger". */
  edge?: string;
  /** Fill token class, e.g. "bg-surface" or "bg-tint-pink". */
  fill?: string;
  /** Registration brackets on the two uncut corners plus a mono serial label. */
  code?: string;
  /** Lets Aura-kun stand on the top edge of this card. Unique per page. */
  ground?: string;
  /** Hover tilt (pointer devices only): card leans toward the cursor, hard shadow slides the other way. */
  tilt?: boolean;
  className?: string;
  innerClassName?: string;
}

const MAX_DEG = 3.5;
const SHADOW = 5;
const SHADOW_SHIFT = 3;

function canTilt(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches;
}

/** Shield-cut card: 1px border drawn by an outer clipped layer, hard shadow on the wrapper. */
export function Chamfer({
  children,
  edge = "bg-line-strong",
  fill = "bg-surface",
  code,
  ground,
  tilt,
  className,
  innerClassName,
}: ChamferProps) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || !canTilt()) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
    const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    el.style.setProperty("--tilt-x", `${(-ny * MAX_DEG).toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${(nx * MAX_DEG).toFixed(2)}deg`);
    el.style.setProperty("--sx", `${(SHADOW - nx * SHADOW_SHIFT).toFixed(2)}px`);
    el.style.setProperty("--sy", `${(SHADOW - ny * SHADOW_SHIFT).toFixed(2)}px`);
  };
  const reset = () => {
    const el = ref.current;
    if (!el) return;
    for (const k of ["--tilt-x", "--tilt-y", "--sx", "--sy"]) el.style.removeProperty(k);
  };
  return (
    <div
      ref={ref}
      className={cn("drop-hard", tilt && "tilt", className)}
      data-ground={ground}
      onPointerMove={tilt ? move : undefined}
      onPointerLeave={tilt ? reset : undefined}
    >
      <div className={cn("chamfer p-px", edge)}>
        <div className={cn("chamfer relative h-full", fill, innerClassName)}>
          {code && (
            <>
              <span aria-hidden className="pointer-events-none absolute left-1.5 top-1.5 size-2.5 border-l-2 border-t-2 border-accent-text" />
              <span aria-hidden className="pointer-events-none absolute bottom-1.5 right-1.5 size-2.5 border-b-2 border-r-2 border-accent-text" />
              <span aria-hidden className="pointer-events-none absolute bottom-1.5 left-5 font-mono text-[10px] uppercase tracking-widest text-muted">{code}</span>
            </>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
