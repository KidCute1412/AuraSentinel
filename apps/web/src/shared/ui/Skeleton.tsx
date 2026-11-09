import { cn } from "@/shared/lib/cn";

/** Square placeholder block. Pulses opacity only (no spinners, design-system §3); static under reduced motion. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse bg-hover motion-reduce:animate-none", className)} />;
}
