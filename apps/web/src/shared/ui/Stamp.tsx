import { Check, TriangleAlert, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export type StampTone = "ok" | "danger" | "warn";

const ICON = { ok: Check, danger: X, warn: TriangleAlert } as const;

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

/** Rubber-stamp verdict. Carries a text label and an icon, so color is never the only signal. */
export function Stamp({ tone, children, animate, className }: StampProps) {
  const Icon = ICON[tone];
  return (
    <span
      className={cn("stamp -rotate-3 inline-flex items-center gap-1 text-xs", TONE[tone], animate && "animate-stamp", className)}
    >
      <Icon aria-hidden strokeWidth={3} className="size-3" />
      {children}
    </span>
  );
}
