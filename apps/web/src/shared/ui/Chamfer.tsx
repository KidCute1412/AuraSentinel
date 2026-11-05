import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface ChamferProps {
  children: ReactNode;
  /** Border color token class, e.g. "bg-line-strong" or "bg-danger". */
  edge?: string;
  /** Fill token class, e.g. "bg-surface" or "bg-tint-pink". */
  fill?: string;
  className?: string;
  innerClassName?: string;
}

/** Shield-cut card: 1px border drawn by an outer clipped layer, hard shadow on the wrapper. */
export function Chamfer({
  children,
  edge = "bg-line-strong",
  fill = "bg-surface",
  className,
  innerClassName,
}: ChamferProps) {
  return (
    <div className={cn("drop-hard", className)}>
      <div className={cn("chamfer p-px", edge)}>
        <div className={cn("chamfer h-full", fill, innerClassName)}>{children}</div>
      </div>
    </div>
  );
}
