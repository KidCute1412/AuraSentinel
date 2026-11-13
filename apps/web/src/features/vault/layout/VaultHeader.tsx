import { useVaultFeed } from "@/shared/api/vaultFeed";
import type { VaultView } from "@/shared/api/vaultSource";
import { AddressChip } from "@/shared/ui/AddressChip";
import { SnowtraceLink } from "@/shared/ui/SnowtraceLink";
import { StatusBadge, type VaultStatus } from "@/shared/ui/StatusBadge";
import { KillSwitch } from "../components/KillSwitch";
import type { VaultRole } from "../guards/access";

const ROLE_TEXT: Record<VaultRole, string> = {
  owner: "You are the owner",
  viewer: "View only",
  anonymous: "View only",
};

/** Status of a vault: incomplete until set up, then protected or revoked from the live state. */
export function vaultStatus(view: VaultView, isActive: boolean | undefined): VaultStatus {
  if (!(view.chain.moduleEnabled && view.chain.policyActive)) return "incomplete";
  return isActive === false ? "revoked" : "active";
}

interface Props {
  view: VaultView;
  role: VaultRole;
  /** Show the compact Kill-Switch here (sub-pages). The Overview has its own full block. */
  compactKill?: boolean;
  /** /demo: anyone can act, so the role line says so. */
  sandbox?: boolean;
}

/** Identity + state of the vault, shown on every page of it. */
export function VaultHeader({ view, role, compactKill, sandbox }: Props) {
  const feed = useVaultFeed(view);
  // Live data without a readable state: say "unknown" rather than claim the vault is protected.
  const status = feed.source === "live" && !feed.state ? "unknown" : vaultStatus(view, feed.state?.isActive);
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
          {view.agent && (
            <span className="inline-flex items-center gap-2">
              <span className="mono-label">Agent</span>
              <AddressChip address={view.agent} />
            </span>
          )}
          <SnowtraceLink kind="address" value={view.safe} />
          <span className="font-mono text-xs uppercase tracking-widest text-muted">{sandbox ? "Public sandbox" : ROLE_TEXT[role]}</span>
        </div>
      </div>

      {compactKill && role === "owner" && status === "active" && (
        <div className="hazard hidden p-1.5 lg:block">
          <div className="bg-bg px-3 py-2">
            <KillSwitch safe={view.safe} isActive size="compact" />
          </div>
        </div>
      )}
    </header>
  );
}
