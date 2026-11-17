import { ServerOff } from "lucide-react";
import type { Address } from "@agentshield/shared";
import type { VaultView } from "@/shared/api/vaultSource";
import { shortAddress } from "@/shared/lib/address";
import { AddressChip } from "@/shared/ui/AddressChip";
import { Panel } from "@/shared/ui/Panel";
import { Skeleton } from "@/shared/ui/Skeleton";
import { SnowtraceLink } from "@/shared/ui/SnowtraceLink";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { useModuleOf } from "@/shared/web3/moduleChain";
import { WalletButton } from "@/shared/web3/WalletButton";
import { KillSwitch } from "../components/KillSwitch";
import { useOwnerControl } from "../hooks/useOwnerControl";

/**
 * Live build, server unreachable: the vault is found on-chain (factory.moduleOf) and read from the module itself, so
 * the owner can still hold the Kill-Switch. "Turn the server off, Kill still works" (pitch). Nothing here calls our API.
 */
export function ChainOnlyVault({ safe, onRetry }: { safe: Address; onRetry: () => void }) {
  const found = useModuleOf(safe);
  const view: VaultView = {
    safe,
    module: found.module,
    agent: null,
    isDemo: false,
    owners: [],
    chain: { moduleEnabled: !!found.module, policyActive: true, funded: true },
    agentGas: "ok",
    scenario: "none",
  };
  const control = useOwnerControl(view, { role: "viewer" });
  const isActive = control.isActive;

  return (
    <div className="space-y-6">
      <div role="status" className="flex flex-wrap items-start justify-between gap-3 border-l-4 border-warn bg-tint-amber px-4 py-3">
        <p className="flex min-w-0 items-start gap-2 text-sm text-fg">
          <ServerOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-bold">Server offline.</span> Reading this vault straight from the chain. Only the Kill-Switch works until the server is back.
          </span>
        </p>
        <button type="button" onClick={onRetry} className="min-h-10 border border-line-strong px-4 text-sm font-bold hover:bg-hover">
          Try the server again
        </button>
      </div>

      <header className="flex flex-col gap-3 border border-line bg-surface p-4 shadow-hard sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono-label">Vault</span>
          <AddressChip address={safe} />
          <StatusBadge vault={isActive === null ? "unknown" : isActive ? "active" : "revoked"} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-soft">
          {control.chain && (
            <span className="inline-flex items-center gap-2">
              <span className="mono-label">Owner</span>
              <AddressChip address={control.chain.owner} />
            </span>
          )}
          <SnowtraceLink kind="address" value={safe} />
        </div>
      </header>

      <div className="max-w-xl">
        {found.status === "loading" || (found.module && isActive === null && !control.notice) ? (
          <Skeleton className="h-40 w-full" />
        ) : !found.module ? (
          <Panel title="Kill-Switch">
            <p className="text-sm text-soft">
              {found.status === "unavailable"
                ? "The chain could not be read either. Check your connection and try again."
                : `No AgentShield module is registered on-chain for ${shortAddress(safe)}.`}
            </p>
          </Panel>
        ) : isActive === null ? (
          <Panel title="Kill-Switch">
            <p className="text-sm text-soft">{control.notice}</p>
          </Panel>
        ) : (
          <div className="space-y-3">
            <KillSwitch isActive={isActive} send={control.revoke} canSign={control.canSign} notice={control.notice} />
            {/* Sign-in (SIWE) needs the server, so offer the wallet connection itself here. */}
            {!control.canSign && <WalletButton />}
          </div>
        )}
      </div>
    </div>
  );
}
