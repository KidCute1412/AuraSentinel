import { ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { Address } from "@agentshield/shared";
import { balanceOf, TOKENS } from "@/shared/api/mockEngine";
import type { VaultView } from "@/shared/api/vaultSource";
import { cn } from "@/shared/lib/cn";
import { groundId } from "@/shared/lib/ground";
import { formatPct, formatTokenAmount } from "@/shared/lib/format";
import { timeAgo } from "@/shared/lib/time";
import { useWizardSafe } from "@/shared/session/wizardSafe";
import { AddressChip } from "@/shared/ui/AddressChip";
import { Skeleton } from "@/shared/ui/Skeleton";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { budgetTone } from "../components/BudgetBar";
import { completedSteps, firstIncompleteStep, STEP_LABEL, WIZARD_STEPS } from "../guards/wizard";
import { useWizardControl } from "../hooks/useWizardControl";
import { useLatestJob, type VaultRead } from "./useMyVaults";
import type { CardStatus } from "./vaultList";

const FILL = { ok: "bg-accent", warn: "bg-warn", danger: "bg-danger" } as const;
const card = "flex flex-col gap-4 border border-line bg-surface p-4 shadow-hard";
const openLink = "inline-flex min-h-10 items-center gap-2 text-sm font-bold text-accent-text underline-offset-4 hover:underline";
const continueBtn = "inline-flex min-h-10 items-center gap-2 bg-accent px-4 text-sm font-bold text-on-accent shadow-hard-sm hover:-translate-x-px hover:-translate-y-px";

function Hint({ tone = "warn", children }: { tone?: "warn" | "muted"; children: React.ReactNode }) {
  return <p className={cn("text-xs", tone === "warn" ? "border-l-4 border-warn bg-tint-amber px-2 py-1 text-fg" : "text-muted")}>{children}</p>;
}

/** Point the wizard at this Safe and open it at the first step still to do (read from the chain there). */
function useContinueSetup() {
  const setSafe = useWizardSafe((s) => s.setSafe);
  const navigate = useNavigate();
  return (safe: Address) => {
    setSafe(safe);
    navigate("/vaults/new");
  };
}

function LatestJob({ view }: { view: VaultView }) {
  const job = useLatestJob(view);
  if (job === undefined) return <Skeleton className="h-5 w-40" />;
  if (job === null) return <Hint tone="muted">No agent activity yet.</Hint>;
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-soft">
      <span className="mono-label">Latest</span>
      <StatusBadge job={job.status} />
      <span>{timeAgo(job.createdAt)}</span>
    </p>
  );
}

/** One of the owner's vaults: status, today's budget, balances and the latest job. Everything shown is from the chain. */
export function VaultCard({ view, read, status }: { view: VaultView; read: VaultRead; status: CardStatus }) {
  const continueSetup = useContinueSetup();
  const { state } = read;
  const pct = state?.budgetUsedPct ?? 0;
  const tone = budgetTone(pct);

  return (
    <article aria-label={`Vault ${view.safe}`} data-ground={groundId("vault", view.safe.slice(2, 10))} className={card}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          {read.load === "loading" ? <Skeleton className="h-6 w-24" /> : <StatusBadge vault={status.status} />}
          {view.isDemo && <span data-aura="inspect" data-aura-line="everyone's playground." className="border border-line-strong px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-soft">Public demo</span>}
        </span>
        <AddressChip address={view.safe} />
      </header>

      {status.status === "incomplete" ? (
        <>
          <p className="text-sm text-soft">Setup is not finished: the agent cannot trade for this vault yet.</p>
          <div className="mt-auto">
            <button type="button" onClick={() => continueSetup(view.safe)} className={continueBtn}>
              Continue setup <ArrowRight aria-hidden className="size-4" />
            </button>
          </div>
        </>
      ) : (
        <>
          {read.load === "unavailable" && <Hint>Could not read this vault from the chain right now. It retries by itself.</Hint>}
          {read.load === "loading" && <Skeleton className="h-16 w-full" />}
          {state && (
            <div className="space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="mono-label">Today's budget</span>
                  <span className="tabular text-sm font-bold">{formatPct(pct)}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Share of today's USDC limit used"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pct)}
                  className="mt-1 h-2 border border-line-strong bg-bg"
                >
                  <div className={cn("h-full", FILL[tone])} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {(["USDC", "WAVAX"] as const).map((sym) => (
                  <div key={sym} className="flex items-baseline gap-2">
                    <dt className="mono-label">{sym}</dt>
                    <dd className="tabular">{formatTokenAmount(balanceOf(state, sym), TOKENS[sym].decimals, 2)}</dd>
                  </div>
                ))}
              </dl>
              {status.expired && <span data-aura="inspect" data-aura-line="renew it. i'm idle."><Hint>Policy expired: the agent is paused until you set a new policy.</Hint></span>}
              {status.empty && !status.expired && <Hint>No funds yet: deposit tokens so the agent has something to manage.</Hint>}
              {status.stale && <Hint tone="muted">Showing the last known numbers; the chain did not answer just now.</Hint>}
              <LatestJob view={view} />
            </div>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-4 border-t border-line pt-3">
            <Link to={`/vaults/${view.safe}`} className={openLink}>
              Open vault <ArrowRight aria-hidden className="size-4" />
            </Link>
            {status.expired && (
              <Link to={`/vaults/${view.safe}/policy`} className={openLink}>
                Set a new policy
              </Link>
            )}
            {status.empty && !status.expired && (
              <Link to={`/vaults/${view.safe}/funds`} className={openLink}>
                Deposit
              </Link>
            )}
          </div>
        </>
      )}
    </article>
  );
}

/**
 * The Safe this browser is setting up (wizard pointer) when the registry does not list it yet: before the module
 * exists, the server does not know about it. Its progress is read from the chain, like in the wizard.
 */
export function SetupCard({ wallet }: { wallet: Address }) {
  const control = useWizardControl(wallet);
  const navigate = useNavigate();
  if (!control.safe) return null;
  const owner = control.owner ?? wallet;
  const first = firstIncompleteStep(completedSteps(owner, control.guard));
  const notYet = control.facts !== null && !control.facts.safeExists;
  return (
    <article aria-label="Vault in setup" data-ground="vault-setup" className={cn(card, "border-accent")}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge vault="incomplete" />
        <AddressChip address={control.safe} />
      </header>
      {control.status === "loading" ? (
        <Skeleton className="h-10 w-full" />
      ) : control.blocker ? (
        <Hint>{control.blocker}</Hint>
      ) : notYet ? (
        <p className="text-sm text-soft">Waiting for this Safe to appear on the chain. If its transaction failed, start again.</p>
      ) : (
        <p className="text-sm text-soft">
          {first ? (
            <>
              Next: step {WIZARD_STEPS.indexOf(first) + 1} of 4, <span className="font-bold text-fg">{STEP_LABEL[first]}</span>.
            </>
          ) : (
            "All steps are done. Open it to finish."
          )}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => navigate("/vaults/new")} className={continueBtn}>
          Continue setup <ArrowRight aria-hidden className="size-4" />
        </button>
        <button type="button" onClick={control.forget} title="Only hides it in this browser; nothing changes on-chain." className="min-h-10 text-sm font-bold text-soft hover:text-fg">
          Remove from list
        </button>
      </div>
    </article>
  );
}
