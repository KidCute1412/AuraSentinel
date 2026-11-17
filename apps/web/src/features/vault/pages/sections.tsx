import { Navigate, useParams } from "react-router-dom";
import { useVaultFeed } from "@/shared/api/vaultFeed";
import { AddressChip } from "@/shared/ui/AddressChip";
import { Panel } from "@/shared/ui/Panel";
import { Skeleton } from "@/shared/ui/Skeleton";
import { KillSwitch } from "../components/KillSwitch";
import { StatePending } from "../components/LivePlaceholders";
import { BalancesPanel } from "../components/BalancesPanel";
import { FundsPanel } from "../components/FundsPanel";
import { PolicyPanel } from "../components/PolicyPanel";
import { useFundsControl } from "../hooks/useFundsControl";
import { useOwnerControl } from "../hooks/useOwnerControl";
import { decideSection, sectionPath } from "../guards/access";
import { useVaultContext } from "../layout/context";
import { VaultDashboard } from "../overview/VaultDashboard";
import { Activity } from "./Activity";
import { JobDetail } from "./JobDetail";
import { RedTeam } from "./RedTeam";

export function OverviewPage() {
  const { view, role } = useVaultContext();
  return <VaultDashboard view={view} role={role} mode="owner" />;
}
export function ActivityPage() {
  const { view, role } = useVaultContext();
  return <Activity view={view} role={role} />;
}
/** Current limits and, for the owner, the form to change them (signed in the wallet). */
export function PolicyPage() {
  const { view, role } = useVaultContext();
  const feed = useVaultFeed(view);
  const control = useOwnerControl(view, { role });
  return (
    <div className="max-w-2xl">
      {feed.state ? <PolicyPanel state={feed.state} control={control} /> : <StatePending title="Policy" status={feed.stateStatus} />}
    </div>
  );
}
/** Balances, and for the owner: deposit, withdraw and test tokens, all signed in the wallet. */
export function FundsPage() {
  const { view, role } = useVaultContext();
  const feed = useVaultFeed(view);
  const funds = useFundsControl(view, feed.state, { role });
  if (!feed.state) return <StatePending title="Vault balances" status={feed.stateStatus} />;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
      <BalancesPanel state={feed.state} lastChange={feed.lastChange} />
      <FundsPanel control={funds} />
    </div>
  );
}
export function RedTeamPage() {
  const { view, role } = useVaultContext();
  return <RedTeam view={view} role={role} />;
}

export function JobDetailPage() {
  const { jobId } = useParams();
  const { view } = useVaultContext();
  return <JobDetail view={view} jobId={jobId} />;
}

/** /settings is owner-only: anyone else who types the URL goes back to Overview with a notice. */
export function SettingsPage() {
  const { safe, view, role } = useVaultContext();
  const control = useOwnerControl(view, { role });
  // The module owner's connected wallet counts as the owner here even before SIWE sign-in: the chain says so.
  if (!control.ready && role !== "owner") return <Skeleton className="h-72 w-full" />;
  const decision = decideSection("settings", control.canSign ? "owner" : role);
  if (decision.kind === "redirect") {
    return <Navigate to={sectionPath(safe, "overview")} replace state={{ notice: decision.notice }} />;
  }
  return <Settings />;
}

/** Agent details and the danger zone: Kill-Switch, then re-activate with a new policy. */
function Settings() {
  const { view, role } = useVaultContext();
  const feed = useVaultFeed(view);
  const control = useOwnerControl(view, { role });
  const isActive = control.isActive ?? feed.state?.isActive;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Panel title="Agent">
          <dl className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="mono-label">Session key</dt>
              <dd>{control.chain ? <AddressChip address={control.chain.policy.agentSigner} /> : view.agent ? <AddressChip address={view.agent} /> : <span className="text-muted">unknown</span>}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="mono-label">Module</dt>
              <dd>{view.module ? <AddressChip address={view.module} /> : <span className="text-muted">none</span>}</dd>
            </div>
            {control.chain && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="mono-label">Policy epoch</dt>
                <dd className="tabular font-mono">{control.chain.epoch.toString()}</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-xs text-muted">The agent can only swap inside the policy. It cannot move funds out of the Safe.</p>
        </Panel>
        {isActive === undefined ? <Skeleton className="h-40 w-full" /> : <KillSwitch isActive={isActive} send={control.revoke} canSign={control.canSign} notice={control.notice} />}
      </div>
      {feed.state ? <PolicyPanel state={feed.state} control={control} /> : <StatePending title="Policy" status={feed.stateStatus} />}
    </div>
  );
}
