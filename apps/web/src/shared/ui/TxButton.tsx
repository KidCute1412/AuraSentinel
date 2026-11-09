import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { SnowtraceLink } from "./SnowtraceLink";
import { describeTxError, isBusy, isUserRejection, txInitial, txReduce } from "./txState";

export interface SentTx {
  hash: string;
  /** Resolves once the tx is mined successfully; rejects on revert. */
  wait: () => Promise<void>;
}

interface Props {
  /** Ask the wallet to sign and broadcast. Resolve with the hash as soon as it is signed. */
  send: () => Promise<SentTx>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  /** Why the button is disabled, shown under it (screen readers too). */
  disabledReason?: string;
  onConfirmed?: (hash: string) => void;
  className?: string;
}

const VARIANT = {
  primary: "bg-accent text-on-accent hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm active:translate-x-0 active:translate-y-0 active:shadow-none shadow-hard",
  secondary: "border border-line-strong bg-transparent text-fg hover:bg-hover",
  danger: "bg-danger text-white shadow-hard hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm active:translate-x-0 active:translate-y-0 active:shadow-none",
} as const;

const fmtSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * Every wallet-signed action goes through this: idle -> waiting for wallet -> processing -> confirmed (timed) / error.
 * A rejected signature returns quietly to idle. The component never holds keys; `send` does the signing.
 */
export function TxButton({ send, children, variant = "primary", disabled, disabledReason, onConfirmed, className }: Props) {
  const [phase, dispatch] = useReducer(txReduce, txInitial);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const click = async () => {
    dispatch({ type: "submit", now: performance.now() });
    try {
      const tx = await send();
      if (!alive.current) return;
      dispatch({ type: "signed", hash: tx.hash });
      await tx.wait();
      if (!alive.current) return;
      dispatch({ type: "confirmed", now: performance.now() });
      onConfirmed?.(tx.hash);
    } catch (err) {
      if (!alive.current) return;
      dispatch(isUserRejection(err) ? { type: "rejected" } : { type: "failed", message: describeTxError(err) });
    }
  };

  const busy = isBusy(phase);
  const label = phase.kind === "signing" ? "Waiting for wallet…" : phase.kind === "pending" ? "Processing…" : children;
  const off = disabled || busy;

  return (
    <div className={cn("inline-flex flex-col items-start gap-2", className)}>
      <button
        type="button"
        onClick={click}
        disabled={off}
        aria-busy={busy}
        className={cn(
          "inline-flex min-h-10 items-center justify-center rounded-none px-5 py-2 text-sm font-bold transition-transform duration-150",
          VARIANT[variant],
          off && "cursor-not-allowed opacity-60 hover:translate-x-0 hover:translate-y-0 hover:shadow-none",
          busy && "animate-pulse motion-reduce:animate-none",
        )}
      >
        {label}
      </button>
      {disabled && disabledReason && <p className="max-w-xs text-xs text-muted">{disabledReason}</p>}
      <div role="status" aria-live="polite" className="min-h-4 font-mono text-xs">
        {phase.kind === "confirmed" && (
          <span className="inline-flex flex-wrap items-center gap-2 text-accent-text">
            Confirmed · {fmtSeconds(phase.ms)}
            <SnowtraceLink kind="tx" value={phase.hash} />
          </span>
        )}
      </div>
      {phase.kind === "error" && (
        <p role="alert" className="max-w-xs border-l-4 border-danger bg-tint-pink px-3 py-2 text-xs text-fg">
          {phase.message}
        </p>
      )}
    </div>
  );
}
