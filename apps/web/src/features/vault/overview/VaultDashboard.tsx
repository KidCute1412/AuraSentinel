import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useJobDetail, useVaultFeed } from "@/shared/api/vaultFeed";
import type { VaultView } from "@/shared/api/vaultSource";
import { cn } from "@/shared/lib/cn";
import { Skeleton } from "@/shared/ui/Skeleton";
import { Panel } from "@/shared/ui/Panel";
import { StickyColumn } from "@/shared/ui/StickyColumn";
import type { VaultRole } from "../guards/access";
import { canRunJobs, sectionPath } from "../guards/access";
import { firstIncompleteStep, completedSteps, wizardPath } from "../guards/wizard";
import { BalancesPanel } from "../components/BalancesPanel";
import { BudgetBar } from "../components/BudgetBar";
import { FundsPanel } from "../components/FundsPanel";
import { JobHistory } from "../components/JobHistory";
import { KillSwitch } from "../components/KillSwitch";
import { StatePending } from "../components/LivePlaceholders";
import { PolicyPanel } from "../components/PolicyPanel";
import { RedTeamPanel } from "../components/RedTeamPanel";
import { VaultNotices } from "../components/VaultNotices";
import { VerdictCard } from "../components/VerdictCard";
import { useFundsControl } from "../hooks/useFundsControl";
import { useOwnerControl, type OwnerControl } from "../hooks/useOwnerControl";
import { headerStatus, VaultHeaderBar } from "../layout/VaultHeader";

/** Free play's three numbered parts, so a newcomer reads the page in order: press, read, watch. */
function StepLabel({ n, title, hint }: { n: string; title: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="bg-ink px-1.5 py-0.5 font-mono text-xs font-bold text-bg">{n}</span>
      <h2 className="text-lg font-black uppercase leading-none tracking-[-0.02em]">{title}</h2>
      <p className="text-sm text-muted">{hint}</p>
    </div>
  );
}

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
 * The Overview: "is this vault safe right now?". The vault (budget and balances, policy, Kill-Switch and funds) in three
 * even columns, then the jobs: the moves and recent jobs beside the verdict of the selected one.
 * Policy, Kill-Switch, deposit and withdraw are all signed in the owner's wallet straight to the chain
 * (useOwnerControl, useFundsControl).
 */
export function VaultDashboard({ view, role, mode }: Props) {
  const feed = useVaultFeed(view);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const verdictRef = useRef<HTMLElement>(null);
  const [autoShown, setAutoShown] = useState(false);

  const live = feed.source === "live";
  const demo = mode === "demo";
  // Jobs: on /demo anyone; elsewhere the owner (and guests on the live demo vault, which the server allows).
  const canAct = demo || canRunJobs(role, view.isDemo, feed.source);
  // Policy + Kill-Switch: the module owner's wallet on live data; the simulation lets the sandbox visitor "sign".
  const control = useOwnerControl(view, { role, sandbox: demo });
  const canSign = control.canSign;
  const funds = useFundsControl(view, feed.state, { role });
  const jobsReady = feed.jobsStatus === "ready";
  const selectedJobId = selectedId ?? feed.jobs[0]?.id;
  const selected = useJobDetail(view, selectedJobId);

  if (!(view.chain.moduleEnabled && view.chain.policyActive)) return <Incomplete view={view} role={role} />;
  if (feed.jobsStatus === "unavailable") {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Panel title="Could not load this vault">
          <p role="alert" className="text-soft">The server did not answer. Your balances and policy are not affected; this is a display problem only.</p>
          <button type="button" onClick={feed.refetch} className="mt-4 min-h-10 border border-line-strong px-4 font-bold hover:bg-hover">Try again</button>
        </Panel>
        {/* The Kill-Switch reads and writes the chain directly, so it stays here while the server is down. */}
        {live && <OwnerKill control={control} fallbackActive={undefined} />}
      </div>
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

  const verdict = selected.job ? (
    <VerdictCard job={selected.job} detailsTo={jobHref(selected.job.id)} />
  ) : selectedJobId && selected.status === "loading" ? (
    <Skeleton className="h-72 w-full" />
  ) : (
    <Panel title="Verdict">
      <p className="text-sm text-muted">The verdict for a job shows up here, with the reason and the full pipeline.</p>
    </Panel>
  );

  /*
   * Both pages read the same way: the loop "press a move, read the verdict" side by side (each column sticks while it
   * fits on the screen, so a short one stays beside a long one), then the vault itself in a balanced three-column grid.
   * The public sandbox puts the loop first (that is what a visitor came for); an owner's page puts the vault first.
   */
  const started = (id: string) => {
    setSelectedId(id);
    // Phones: the verdict sits below the moves, so bring it up.
    requestAnimationFrame(() => {
      const el = verdictRef.current;
      if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
        el.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
      }
    });
  };
  const offset = demo ? "header" : "app";
  // The Auto red-team board already lists its five runs, so the recent jobs under it shrink to the two before them.
  const historyLimit = autoShown ? 2 : 4;

  const loop = (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <StickyColumn offset={offset} className="space-y-3">
        {demo && <StepLabel n="01" title="Pick a move" hint={live ? "Runs for real on Avalanche Fuji. Presses are rate-limited." : "A simulation: nothing real moves."} />}
        <RedTeamPanel view={view} canAct={canAct} onStarted={started} onAutoShown={setAutoShown} layout="tabs" />
        <JobHistory jobs={feed.jobs} selectedId={selectedJobId} onSelect={setSelectedId} limit={historyLimit} allHref={demo && !live ? undefined : sectionPath(view.safe, "activity")} />
      </StickyColumn>
      <StickyColumn ref={verdictRef} offset={offset} className="scroll-mt-20 space-y-3">
        {demo && <StepLabel n="02" title="Read the verdict" hint="Decided by rules, never by the AI." />}
        {verdict}
      </StickyColumn>
    </div>
  );

  const budget = state ? <BudgetBar state={state} /> : <StatePending title="Daily budget" status={feed.stateStatus} />;
  const balances = state ? <BalancesPanel state={state} lastChange={feed.lastChange} /> : <StatePending title="Vault balances" status={feed.stateStatus} />;
  const policy = state ? <PolicyPanel state={state} control={control} /> : <StatePending title="Policy" status={feed.stateStatus} />;
  const showKill = canSign || live;
  // Deposit and withdraw: a vault's own owner only, never on the public sandbox.
  const showFunds = !demo && !!state && funds.canAct;
  /*
   * Three even columns. With a Kill-Switch (and funds) to show: budget over balances, the policy, then those controls.
   * Without them (a guest on the simulation): budget, balances and policy side by side, so no column is left empty.
   */
  const vault =
    showKill || showFunds ? (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-6">
          {budget}
          {balances}
        </div>
        {policy}
        <div className="space-y-6">
          {/* Phones get the Kill-Switch dock instead when they can sign. */}
          {showKill && (
            <div className={cn(canSign && "hidden lg:block")}>
              <OwnerKill control={control} fallbackActive={state?.isActive} />
            </div>
          )}
          {showFunds && <FundsPanel control={funds} />}
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2 lg:grid-cols-3">
        {budget}
        {balances}
        {policy}
      </div>
    );

  if (demo) {
    return (
      <div className="space-y-6">
        <VaultNotices state={state} stateStatus={feed.stateStatus} source={feed.source} />
        {loop}
        <section aria-label="The vault right now" className="space-y-3">
          <StepLabel n="03" title="Watch the vault" hint="Read from the blockchain. Trades and the Kill-Switch change it." />
          <VaultHeaderBar view={view} status={headerStatus(view, feed.source, control.isActive, state?.isActive)} roleText="Public sandbox" />
          {vault}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <VaultNotices state={state} stateStatus={feed.stateStatus} source={feed.source} />
      <section aria-label="The vault right now">{vault}</section>
      <section aria-label="Jobs and verdicts">{loop}</section>
    </div>
  );
}

/**
 * The full Kill-Switch block. Live: shown to everyone, so a visitor sees the control exists and why it is off for
 * them; only the module owner's wallet can hold it down. Waits for a known state rather than guess "active".
 */
function OwnerKill({ control, fallbackActive, onKilled }: { control: OwnerControl; fallbackActive: boolean | undefined; onKilled?: () => void }) {
  const isActive = control.isActive ?? fallbackActive;
  if (isActive === undefined) {
    return control.notice ? (
      <Panel title="Kill-Switch">
        <p className="text-sm text-soft">{control.notice}</p>
      </Panel>
    ) : (
      <Skeleton className="h-40 w-full" />
    );
  }
  return <KillSwitch isActive={isActive} send={control.revoke} canSign={control.canSign} notice={control.notice} onKilled={onKilled} />;
}
