import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/shared/lib/cn";
import { dangerCta, primaryCta } from "@/shared/ui/cta";

interface Props {
  children: string;
  onComplete: () => void;
  onStart?: () => void;
  ms?: number;
  /** "danger" for the Kill-Switch: red fill, white label. */
  tone?: "primary" | "danger";
  disabled?: boolean;
  /** Label while the button is being held. */
  holdingLabel?: string;
  className?: string;
}

/** Press and hold to confirm. Works with pointer and with Space/Enter held down. */
export function HoldButton({ children, onComplete, onStart, ms = 700, tone = "primary", disabled, holdingLabel = "Keep holding…", className }: Props) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stop = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };
  const start = () => {
    if (holding || disabled) return;
    setHolding(true);
    onStart?.();
    timer.current = setTimeout(() => {
      setHolding(false);
      onComplete();
    }, ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const onKey = (e: KeyboardEvent) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      start();
    }
  };
  return (
    <span className={cn("drop-hard inline-block select-none", disabled && "opacity-60")}>
      <button
        type="button"
        disabled={disabled}
        className={cn(tone === "danger" ? dangerCta : primaryCta, "relative overflow-hidden touch-none disabled:cursor-not-allowed", className)}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={onKey}
        onKeyUp={stop}
        onBlur={stop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span aria-hidden className={cn("absolute inset-y-0 left-0", tone === "danger" ? "bg-on-accent/30" : "bg-on-accent/25")} style={{ width: holding ? "100%" : "0%", transition: holding ? `width ${ms}ms linear` : "width 120ms ease-out" }} />
        <span className="relative">{holding ? holdingLabel : children}</span>
      </button>
    </span>
  );
}
