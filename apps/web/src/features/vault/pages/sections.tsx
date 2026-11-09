import { Navigate, useParams } from "react-router-dom";
import { decideSection, sectionPath } from "../guards/access";
import { useVaultContext } from "../layout/context";
import { Placeholder } from "./Placeholder";
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
export const PolicyPage = () => (
  <Placeholder code="VLT / POLICY" title="Policy" blurb="Current limits, a policy form (preview, then sign with the owner wallet) and the change history read from the chain." />
);
export const FundsPage = () => (
  <Placeholder code="VLT / FUNDS" title="Funds" blurb="Balances per token, deposit and withdraw (owner) and transfer history." />
);
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
  const { safe, role } = useVaultContext();
  const decision = decideSection("settings", role);
  if (decision.kind === "redirect") {
    return <Navigate to={sectionPath(safe, "overview")} replace state={{ notice: decision.notice }} />;
  }
  return (
    <Placeholder code="VLT / SETTINGS" title="Settings" blurb="Agent details and the danger zone: Kill-Switch (hold to activate) and re-activate after a kill." />
  );
}
