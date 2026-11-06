import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/shared/lib/cn";
import { primaryCta } from "@/features/landing/cta";

interface Props {
  children: string;
  onComplete: () => void;
  onStart?: () => void;
  ms?: number;
}

/** Press and hold to confirm. Works with pointer and with Space/Enter held down. */
export function HoldButton({ children, onComplete, onStart, ms = 700 }: Props) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stop = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };
  const start = () => {
    if (holding) return;
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
    <span className="drop-hard inline-block select-none">
      <button
        type="button"
        className={cn(primaryCta, "relative overflow-hidden touch-none")}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={onKey}
        onKeyUp={stop}
        onBlur={stop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 bg-on-accent/25" style={{ width: holding ? "100%" : "0%", transition: holding ? `width ${ms}ms linear` : "width 120ms ease-out" }} />
        <span className="relative">{holding ? "Keep holding…" : children}</span>
      </button>
    </span>
  );
}
