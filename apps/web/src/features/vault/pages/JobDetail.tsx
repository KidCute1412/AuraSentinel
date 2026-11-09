import { Link } from "react-router-dom";
import { fromAmount } from "@agentshield/shared";
import { useVaultSim } from "@/shared/api/mockChain";
import { tokenByAddress } from "@/shared/api/mockEngine";
import type { VaultView } from "@/shared/api/vaultSource";
import { formatTokenAmount } from "@/shared/lib/format";
import { timeAgo } from "@/shared/lib/time";
import { AddressChip } from "@/shared/ui/AddressChip";
import { Panel } from "@/shared/ui/Panel";
import { Skeleton } from "@/shared/ui/Skeleton";
import { sectionPath } from "../guards/access";
import { VerdictCard } from "../components/VerdictCard";

/** Shareable page for one job: the verdict, then the raw facts behind it. */
export function JobDetail({ view, jobId }: { view: VaultView; jobId: string | undefined }) {
  const sim = useVaultSim(view);
  if (!sim) return <Skeleton className="h-96 w-full" />;
  const job = sim.jobs.find((j) => j.id === jobId);
  if (!job) {
    return (
      <Panel title="Job not found">
        <p className="text-soft">There is no job with this id in this vault. The link may be wrong or the job may belong to another vault.</p>
        <Link to={sectionPath(view.safe, "overview")} className="mt-4 inline-block font-bold text-accent-text underline underline-offset-4">Back to the overview</Link>
      </Panel>
    );
  }
  const tokenIn = job.intent ? tokenByAddress(job.intent.tokenIn) : undefined;
  const tokenOut = job.intent ? tokenByAddress(job.intent.tokenOut) : undefined;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <VerdictCard job={job} />
      <Panel title="Job facts">
        <dl className="space-y-3 text-sm">
          <div><dt className="mono-label">Id</dt><dd className="mt-1 break-all font-mono text-xs">{job.id}</dd></div>
          <div><dt className="mono-label">Started</dt><dd className="mt-1">{timeAgo(job.createdAt)}</dd></div>
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
                Vault gains {formatTokenAmount(fromAmount(job.sim.deltaSafeTokenOut), 18, 4)} WAVAX · attacker holds {job.sim.attackerBalance} · allowance left {job.sim.allowanceAfter}
              </dd>
            </div>
          )}
        </dl>
      </Panel>
    </div>
  );
}
