import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { useInView } from "@/shared/lib/useInView";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger in ms, applied as transition-delay. */
  delay?: number;
}

/** Fades a block in (200ms) the first time it scrolls into view. Reduced motion shows it instantly via CSS. */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-in={seen} style={delay ? { transitionDelay: `${delay}ms` } : undefined} className={cn("reveal", className)}>
      {children}
    </div>
  );
}
