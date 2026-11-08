import { Lock } from "lucide-react";
import { AddressChip } from "@/shared/ui/AddressChip";
import { SnowtraceLink } from "@/shared/ui/SnowtraceLink";
import { StatusBadge, type VaultStatus } from "@/shared/ui/StatusBadge";
import type { VaultView } from "@/shared/api/vaultSource";
import type { VaultRole } from "../guards/access";

const ROLE_TEXT: Record<VaultRole, string> = {
  owner: "You are the owner",
  viewer: "View only",
  anonymous: "View only",
};

export function vaultStatus(view: VaultView): VaultStatus {
  const ready = view.chain.moduleEnabled && view.chain.policyActive && view.state !== null;
  if (!ready) return "incomplete";
  return view.state!.isActive ? "active" : "revoked";
}

/**
 * Identity + state of the vault, shown on every sub-page. The Kill-Switch lives here for owners so it is one
 * click away from anywhere (ui-pages §4); the real control is built in a later step, this is its reserved slot.
 */
export function VaultHeader({ view, role }: { view: VaultView; role: VaultRole }) {
  const status = vaultStatus(view);
  return (
    <header className="flex flex-col gap-4 border border-line bg-surface p-4 shadow-hard sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono-label">Vault</span>
          <AddressChip address={view.safe} />
          <StatusBadge vault={status} />
          {view.isDemo && <span className="border border-line-strong px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-soft">Demo</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-soft">
          <span className="inline-flex items-center gap-2">
            <span className="mono-label">Agent</span>
            <AddressChip address={view.agent} />
          </span>
          <SnowtraceLink kind="address" value={view.safe} />
          <span className="font-mono text-xs uppercase tracking-widest text-muted">{ROLE_TEXT[role]}</span>
        </div>
      </div>

      {role === "owner" && status === "active" && (
        <div className="hazard p-1.5" data-slot="kill-switch">
          <div aria-disabled className="flex min-h-11 items-center gap-2 bg-bg px-4 font-mono text-xs font-bold uppercase tracking-widest text-muted">
            <Lock aria-hidden className="size-4" />
            Kill-Switch · coming soon
          </div>
        </div>
      )}
    </header>
  );
}
