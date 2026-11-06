import { cn } from "@/shared/lib/cn";

export type StampTone = "ok" | "danger" | "warn";

const TONE: Record<StampTone, string> = {
  ok: "text-accent-text",
  danger: "text-danger-text",
  warn: "text-warn",
};

interface StampProps {
  tone: StampTone;
  children: string;
  /** Plays the 200ms "thump" when it appears. */
  animate?: boolean;
  className?: string;
}

/** Rubber-stamp verdict. Always carries a text label, so color is never the only signal. */
export function Stamp({ tone, children, animate, className }: StampProps) {
  return (
    <span
      className={cn("stamp -rotate-3 text-xs", TONE[tone], animate && "animate-stamp", className)}
    >
      {children}
    </span>
  );
}
