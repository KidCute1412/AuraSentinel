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
