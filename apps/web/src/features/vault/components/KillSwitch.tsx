import { Lock, ShieldOff } from "lucide-react";
import { useReducer, useRef } from "react";
import { cn } from "@/shared/lib/cn";
import { followTx } from "@/shared/mascot/auraEvents";
import { HoldButton } from "@/shared/ui/HoldButton";
import { SnowtraceLink } from "@/shared/ui/SnowtraceLink";
import type { SentTx } from "@/shared/ui/TxButton";
import { describeTxError, isUserRejection, txInitial, txReduce } from "@/shared/ui/txState";

interface Props {
  isActive: boolean;
  /** Sign and send the revoke (useOwnerControl): the wallet on live data, the simulation otherwise. */
  send: () => Promise<SentTx>;
  /** The connected wallet is the module owner. Otherwise the block shows `notice` and the button stays off. */
  canSign?: boolean;
  notice?: string | null;
  /** "full" = the hazard-zone block on the dashboard; "compact" = one button for headers and the phone dock. */
  size?: "full" | "compact";
  onKilled?: () => void;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * Owner revokes the agent. Hold-to-confirm so it cannot be hit by accident, signed in the owner's wallet and
 * sent straight to the chain: it keeps working with our server switched off (invariant 2).
 */
export function KillSwitch({ isActive, send, canSign = true, notice, size = "full", onKilled }: Props) {
  const [phase, dispatch] = useReducer(txReduce, txInitial);
  const hash = useRef<string | null>(null);

  const fire = async () => {
    dispatch({ type: "submit", now: performance.now() });
    const aura = followTx({ danger: true });
    aura.waiting();
    try {
      const tx = await send();
      aura.sent();
      hash.current = tx.hash;
      dispatch({ type: "signed", hash: tx.hash, now: performance.now() });
      await tx.wait();
      aura.confirmed("kill-switch-card");
      dispatch({ type: "confirmed", now: performance.now() });
      onKilled?.();
    } catch (err) {
      if (isUserRejection(err)) aura.declined();
      else aura.failed();
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
    <HoldButton tone="danger" ms={800} disabled={busy || !isActive || !canSign} onComplete={() => void fire()} holdingLabel="Keep holding…">
      {label}
    </HoldButton>
  );

  if (size === "compact") {
    // Compact spots (header, phone dock) are for the owner only: nothing to show anyone else.
    if (!canSign && phase.kind !== "confirmed") return null;
    return (
      <div className="flex items-center gap-3">
        {isActive ? control : null}
        {status}
        {phase.kind === "error" && <span role="alert" className="font-mono text-xs text-danger-text">{phase.message}</span>}
      </div>
    );
  }

  return (
    <section id="kill-switch" aria-label="Kill-Switch" data-ground="kill-switch-card" data-aura="danger" data-aura-line="easy... slow hands." className={cn("hazard p-2", !isActive && "opacity-90")}>
      <div className="space-y-4 bg-bg p-4">
        <div>
          <h2 className="mono-label !text-danger-text">Kill-Switch</h2>
          <p className="mt-2 text-sm text-soft">
            Locks the agent out in one signature. It is signed in your wallet and sent straight to the chain, so it works even if our server is down.
          </p>
        </div>
        {control}
        {!canSign && notice && <p className="text-sm text-soft">{notice}</p>}
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
