import type { ReactNode } from "react";
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
  className?: string;
  innerClassName?: string;
}

/** Shield-cut card: 1px border drawn by an outer clipped layer, hard shadow on the wrapper. */
export function Chamfer({
  children,
  edge = "bg-line-strong",
  fill = "bg-surface",
  code,
  ground,
  className,
  innerClassName,
}: ChamferProps) {
  return (
    <div className={cn("drop-hard", className)} data-ground={ground}>
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
