import { ArrowLeft, Check, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fromAmount, type JobDetailDto } from "@agentshield/shared";
import { useVaultSim } from "@/shared/api/mockChain";
import { tokenByAddress, type VaultSim } from "@/shared/api/mockEngine";
import type { VaultView } from "@/shared/api/vaultSource";
import { formatPct, formatTokenAmount } from "@/shared/lib/format";
import { timeAgo } from "@/shared/lib/time";
import { AddressChip } from "@/shared/ui/AddressChip";
import { Panel } from "@/shared/ui/Panel";
import { Skeleton } from "@/shared/ui/Skeleton";
import { sectionPath } from "../guards/access";
import { VerdictCard } from "../components/VerdictCard";

/** Copies the page URL (ui-pages §10.2: the job page is the link people share). */
function CopyLink() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setState("copied");
    } catch {
      setState("failed");
    }
  };
  return (
    <button type="button" onClick={() => void copy()} className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-3 font-bold hover:bg-hover">
      {state === "copied" ? <Check aria-hidden strokeWidth={3} className="size-4 text-accent-text" /> : <Link2 aria-hidden className="size-4" />}
      <span aria-live="polite">{state === "copied" ? "Link copied" : state === "failed" ? "Copy failed, use the address bar" : "Copy link"}</span>
    </button>
  );
}

interface Row {
  symbol: string;
  before: string | null;
  after: string | null;
  change: string;
}

const signed = (v: bigint, decimals: number) => `${v > 0n ? "+" : ""}${formatTokenAmount(v, decimals, 4)}`;

/**
 * Balance rows for this job. The exact before/after is known for the latest confirmed swap; for older swaps the
 * simulation deltas still say what moved. A blocked job moved nothing, which is the point.
 */
function balanceRows(job: JobDetailDto, sim: VaultSim): Row[] {
  if (sim.lastChange?.jobId === job.id) {
    const { before, after } = sim.lastChange;
    return before.map((b) => {
      const a = after.find((x) => x.token === b.token) ?? b;
      const from = fromAmount(b.amount);
      const to = fromAmount(a.amount);
      return { symbol: b.symbol, before: formatTokenAmount(from, b.decimals, 4), after: formatTokenAmount(to, b.decimals, 4), change: signed(to - from, b.decimals) };
    });
  }
  if (!job.sim || !job.intent) return [];
  const tIn = tokenByAddress(job.intent.tokenIn);
  const tOut = tokenByAddress(job.intent.tokenOut);
  if (!tIn || !tOut) return [];
  // Signed base units from the simulator; BigInt keeps them exact (display only).
  return [
    { symbol: tIn.symbol, before: null, after: null, change: signed(BigInt(job.sim.deltaSafeTokenIn), tIn.decimals) },
    { symbol: tOut.symbol, before: null, after: null, change: signed(BigInt(job.sim.deltaSafeTokenOut), tOut.decimals) },
  ];
}

function BalancePanel({ job, sim }: { job: JobDetailDto; sim: VaultSim }) {
  const rows = balanceRows(job, sim);
  const exact = rows.some((r) => r.before !== null);
  return (
    <Panel title="Before / after">
      {rows.length === 0 ? (
        <p className="text-sm text-soft">{job.status === "confirmed" ? "No balance data for this job." : "No funds moved. The vault balances are exactly as they were."}</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Vault balances around this job</caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="mono-label py-2 font-normal">Token</th>
              {exact && <th scope="col" className="mono-label py-2 text-right font-normal">Before</th>}
              {exact && <th scope="col" className="mono-label py-2 text-right font-normal">After</th>}
              <th scope="col" className="mono-label py-2 text-right font-normal">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.symbol}>
                <th scope="row" className="py-2 text-left font-mono font-bold">{r.symbol}</th>
                {exact && <td className="tabular py-2 text-right font-mono">{r.before}</td>}
                {exact && <td className="tabular py-2 text-right font-mono">{r.after}</td>}
                <td className="tabular py-2 text-right font-mono font-bold">{r.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {job.status === "confirmed" && job.explanation && (
        <p className="mt-3 border-t border-line pt-3 text-sm text-soft">
          Daily budget used after this job: <span className="tabular font-mono font-bold text-fg">{formatPct(job.explanation.budgetUsedPct)}</span>
        </p>
      )}
    </Panel>
  );
}

/** Shareable page for one job (ui-pages §10.2): the verdict with step times, what moved, then the raw facts. */
export function JobDetail({ view, jobId }: { view: VaultView; jobId: string | undefined }) {
  const sim = useVaultSim(view);
  const back = (
    <Link to={sectionPath(view.safe, "activity")} className="inline-flex min-h-10 items-center gap-2 font-bold text-accent-text underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden className="size-4" /> All activity
    </Link>
  );
  if (!sim) return <Skeleton className="h-96 w-full" />;
  const job = sim.jobs.find((j) => j.id === jobId);
  if (!job) {
    return (
      <Panel title="Job not found">
        <p className="text-soft">There is no job with this id in this vault. The link may be wrong or the job may belong to another vault.</p>
        <div className="mt-4">{back}</div>
      </Panel>
    );
  }
  const tokenIn = job.intent ? tokenByAddress(job.intent.tokenIn) : undefined;
  const tokenOut = job.intent ? tokenByAddress(job.intent.tokenOut) : undefined;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <CopyLink />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <VerdictCard job={job} showTimes />
        <div className="space-y-6">
          <BalancePanel job={job} sim={sim} />
          <Panel title="Job facts">
            <dl className="space-y-3 text-sm">
              <div><dt className="mono-label">Id</dt><dd className="mt-1 break-all font-mono text-xs">{job.id}</dd></div>
              <div><dt className="mono-label">Started</dt><dd className="mt-1"><time dateTime={job.createdAt}>{timeAgo(job.createdAt)}</time></dd></div>
              <div><dt className="mono-label">Origin</dt><dd className="mt-1 capitalize">{job.origin}</dd></div>
              {job.intent && tokenIn && tokenOut && (
                <>
                  <div>
                    <dt className="mono-label">Trade</dt>
                    <dd className="tabular mt-1">
                      {formatTokenAmount(fromAmount(job.intent.amountIn), tokenIn.decimals)} {tokenIn.symbol} → {tokenOut.symbol}
                    </dd>
                  </div>
                  <div><dt className="mono-label">Recipient</dt><dd className="mt-1"><AddressChip address={job.intent.recipient} /></dd></div>
                </>
              )}
              {job.sim && (
                <div>
                  <dt className="mono-label">Simulation</dt>
                  <dd className="tabular mt-1 text-soft">
                    Attacker holds {job.sim.attackerBalance} · allowance left {job.sim.allowanceAfter}
                  </dd>
                </div>
              )}
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
