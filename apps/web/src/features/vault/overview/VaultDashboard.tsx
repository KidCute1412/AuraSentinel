import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useJobDetail, useVaultFeed } from "@/shared/api/vaultFeed";
import type { VaultView } from "@/shared/api/vaultSource";
import { Skeleton } from "@/shared/ui/Skeleton";
import { Panel } from "@/shared/ui/Panel";
import type { VaultRole } from "../guards/access";
import { canRunJobs, sectionPath } from "../guards/access";
import { firstIncompleteStep, completedSteps, wizardPath } from "../guards/wizard";
import { BalancesPanel } from "../components/BalancesPanel";
import { BudgetBar } from "../components/BudgetBar";
import { FundsPanel } from "../components/FundsPanel";
import { JobHistory } from "../components/JobHistory";
import { KillSwitch } from "../components/KillSwitch";
import { OwnerControlsOffline, StatePending } from "../components/LivePlaceholders";
import { PolicyPanel } from "../components/PolicyPanel";
import { RedTeamPanel } from "../components/RedTeamPanel";
import { TourCard } from "../components/TourCard";
import { VaultNotices } from "../components/VaultNotices";
import { VerdictCard } from "../components/VerdictCard";
import { tourProgress } from "../lib/tour";

interface Props {
  view: VaultView;
  role: VaultRole;
  /** "demo" = the public sandbox behind /demo (anyone can act); "owner" = a normal vault page. */
  mode: "owner" | "demo";
}

function Incomplete({ view, role }: { view: VaultView; role: VaultRole }) {
  const next = firstIncompleteStep(completedSteps(view.owners[0] ?? null, { owners: view.owners, ...view.chain }));
  return (
    <Panel title="Setup incomplete">
      <p className="text-soft">This vault is not ready yet, so there is nothing to show. The agent cannot trade until setup finishes.</p>
      {role === "owner" ? (
        <Link to={wizardPath(next ?? "safe")} className="mt-4 inline-flex min-h-11 items-center bg-accent px-5 font-bold text-on-accent shadow-hard hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm">
          Continue setup
        </Link>
      ) : (
        <p className="mt-3 text-sm text-muted">Only the owner can finish setting it up.</p>
      )}
    </Panel>
  );
}

/**
 * The Overview: "is this vault safe right now?" on one screen. Policy and Kill-Switch on the left, balances, budget
 * and the verdict of the selected job in the middle, the red-team tools on the right (stacked in that order on phones).
 * On live data the owner's wallet actions (policy, Kill-Switch, funds) stay off until they are wired to the chain.
 */
export function VaultDashboard({ view, role, mode }: Props) {
  const feed = useVaultFeed(view);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [killedHere, setKilledHere] = useState(false);
  const visitStart = useRef(Date.now());

  const live = feed.source === "live";
  const demo = mode === "demo";
  // On /demo a shared sandbox owner signs for visitors, so anyone can try every control.
  const canAct = demo || canRunJobs(role, view.isDemo, feed.source);
  // Wallet-signed owner actions are simulated only for now; never let them look like they changed a live vault.
  const canSign = canAct && !live;
  const jobsReady = feed.jobsStatus === "ready";
  const selectedJobId = selectedId ?? feed.jobs[0]?.id;
  const selected = useJobDetail(view, selectedJobId);
  const tour = useMemo(
    () => (demo && jobsReady ? tourProgress(feed.jobs, view.safe, visitStart.current, killedHere) : null),
    [demo, jobsReady, feed.jobs, view.safe, killedHere],
  );

  if (!(view.chain.moduleEnabled && view.chain.policyActive)) return <Incomplete view={view} role={role} />;
  if (feed.jobsStatus === "unavailable") {
    return (
      <Panel title="Could not load this vault">
        <p role="alert" className="text-soft">The server did not answer. Your balances and policy are not affected; this is a display problem only.</p>
        <button type="button" onClick={feed.refetch} className="mt-4 min-h-10 border border-line-strong px-4 font-bold hover:bg-hover">Try again</button>
      </Panel>
    );
  }
  if (!jobsReady || feed.stateStatus === "loading") {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3" aria-busy>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-72 w-full" />
        ))}
      </div>
    );
  }

  const { state } = feed;
  const jobHref = (id: string) => (demo ? undefined : `${sectionPath(view.safe, "activity")}/${id}`);

  return (
    <div className="space-y-6">
      <VaultNotices state={state} stateStatus={feed.stateStatus} source={feed.source} />
      {tour && <TourCard steps={tour} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Column 1: owner controls */}
        <div className="space-y-6">
          {demo && (
            <p className="border-l-4 border-line-strong bg-tint-sky px-3 py-2 text-xs text-soft">
              {live
                ? "Live sandbox on Avalanche Fuji: anyone can run a rebalance or an attack here. Presses are rate-limited."
                : "Sandbox: a shared demo owner signs for you here. On your own vault you sign in your wallet."}
            </p>
          )}
          {state ? <PolicyPanel safe={view.safe} state={state} canEdit={canSign} /> : <StatePending title="Policy" status={feed.stateStatus} />}
          {canSign && state && (
            <div className="hidden lg:block">
              <KillSwitch safe={view.safe} isActive={state.isActive} onKilled={() => setKilledHere(true)} />
            </div>
          )}
          {live && canAct && <OwnerControlsOffline />}
          {role === "owner" && !demo && canSign && state && <FundsPanel safe={view.safe} state={state} />}
        </div>

        {/* Column 2: what is happening */}
        <div className="space-y-6">
          {state ? <BudgetBar state={state} /> : <StatePending title="Daily budget" status={feed.stateStatus} />}
          {state ? <BalancesPanel state={state} lastChange={feed.lastChange} /> : <StatePending title="Vault balances" status={feed.stateStatus} />}
          {selected.job ? (
            <VerdictCard job={selected.job} detailsTo={jobHref(selected.job.id)} />
          ) : selectedJobId && selected.status === "loading" ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <Panel title="Verdict">
              <p className="text-sm text-muted">The verdict for a job shows up here, with the reason and the full pipeline.</p>
            </Panel>
          )}
          <JobHistory jobs={feed.jobs} selectedId={selectedJobId} onSelect={setSelectedId} allHref={demo ? undefined : sectionPath(view.safe, "activity")} />
        </div>

        {/* Column 3: red team */}
        <div>
          <RedTeamPanel view={view} canAct={canAct} onStarted={setSelectedId} />
        </div>
      </div>
    </div>
  );
}
