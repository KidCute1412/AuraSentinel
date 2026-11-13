import { Lock } from "lucide-react";
import type { LoadStatus } from "@/shared/api/vaultFeed";
import { Panel } from "@/shared/ui/Panel";
import { Skeleton } from "@/shared/ui/Skeleton";

/**
 * Stand-in for a panel that needs the vault's on-chain state when the live server cannot serve it (yet). Says so
 * plainly instead of showing zeros, so a missing number is never mistaken for an empty vault.
 */
export function StatePending({ title, status }: { title: string; status: LoadStatus }) {
  return (
    <Panel title={title}>
      {status === "loading" ? (
        <div aria-busy="true" className="space-y-2">
          <span className="sr-only">Loading</span>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <p className="text-sm text-muted">Not available yet: the server cannot read this vault's on-chain state.</p>
      )}
    </Panel>
  );
}

/**
 * Live data, owner controls not wired yet: the Kill-Switch and policy changes are signed in the owner's wallet
 * (invariant 2), and that wallet flow is not connected to the live vault in this build. Nothing here can change it.
 */
export function OwnerControlsOffline() {
  return (
    <Panel title="Kill-Switch">
      <div className="flex items-start gap-3 text-sm text-soft">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>The owner signs the Kill-Switch and policy changes in their own wallet. That step is not connected to this live vault yet, so these controls are off here.</p>
      </div>
    </Panel>
  );
}
