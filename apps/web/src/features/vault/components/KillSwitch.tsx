import { Lock, ShieldOff } from "lucide-react";
import { useReducer, useRef } from "react";
import { killTx } from "@/shared/api/mockChain";
import { cn } from "@/shared/lib/cn";
import { HoldButton } from "@/shared/ui/HoldButton";
import { SnowtraceLink } from "@/shared/ui/SnowtraceLink";
import { describeTxError, isUserRejection, txInitial, txReduce } from "@/shared/ui/txState";

interface Props {
  safe: string;
  isActive: boolean;
  /** "full" = the hazard-zone block on the dashboard; "compact" = one button for headers and the phone dock. */
  size?: "full" | "compact";
  onKilled?: () => void;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * Owner revokes the agent. Hold-to-confirm so it cannot be hit by accident, signed in the owner's wallet and
 * sent straight to the chain: it keeps working with our server switched off (invariant 2).
 */
export function KillSwitch({ safe, isActive, size = "full", onKilled }: Props) {
  const [phase, dispatch] = useReducer(txReduce, txInitial);
  const hash = useRef<string | null>(null);

  const fire = async () => {
    dispatch({ type: "submit", now: performance.now() });
    try {
      const tx = await killTx(safe)();
      hash.current = tx.hash;
      dispatch({ type: "signed", hash: tx.hash });
      await tx.wait();
      dispatch({ type: "confirmed", now: performance.now() });
      onKilled?.();
    } catch (err) {
      dispatch(isUserRejection(err) ? { type: "rejected" } : { type: "failed", message: describeTxError(err) });
    }
  };

  const busy = phase.kind === "signing" || phase.kind === "pending";
  const label = phase.kind === "signing" ? "Waiting for wallet…" : phase.kind === "pending" ? "Locking the vault…" : "Hold to Kill-Switch";

  const status = (
    <div role="status" aria-live="polite" className="font-mono text-xs">
      {phase.kind === "confirmed" && (
        <span className="inline-flex flex-wrap items-center gap-2 text-danger-text">
          <ShieldOff aria-hidden className="size-4" />
          Locked after {seconds(phase.ms)}
          <SnowtraceLink kind="tx" value={phase.hash} />
        </span>
      )}
      {!isActive && phase.kind !== "confirmed" && <span className="inline-flex items-center gap-2 text-danger-text"><Lock aria-hidden className="size-4" />Already locked</span>}
    </div>
  );

  const control = (
    <HoldButton tone="danger" ms={800} disabled={busy || !isActive} onComplete={() => void fire()} holdingLabel="Keep holding…">
      {label}
    </HoldButton>
  );

  if (size === "compact") {
    return (
      <div className="flex items-center gap-3">
        {isActive ? control : null}
        {status}
        {phase.kind === "error" && <span role="alert" className="font-mono text-xs text-danger-text">{phase.message}</span>}
      </div>
    );
  }

  return (
    <section aria-label="Kill-Switch" className={cn("hazard p-2", !isActive && "opacity-90")}>
      <div className="space-y-4 bg-bg p-4">
        <div>
          <h2 className="mono-label !text-danger-text">Kill-Switch</h2>
          <p className="mt-2 text-sm text-soft">
            Locks the agent out in one signature. It is signed in your wallet and sent straight to the chain, so it works even if our server is down.
          </p>
        </div>
        {control}
        {status}
        {phase.kind === "error" && (
          <p role="alert" className="border-l-4 border-danger bg-tint-pink px-3 py-2 text-xs text-fg">
            {phase.message}
          </p>
        )}
      </div>
    </section>
  );
}
