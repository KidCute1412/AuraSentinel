import { Link } from "react-router-dom";
import type { JobDetailDto } from "@agentshield/shared";
import { REASONS, type ReasonCode } from "@/shared/api/mockEngine";
import { shortAddress } from "@/shared/lib/address";
import { cn } from "@/shared/lib/cn";
import { formatPct } from "@/shared/lib/format";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Skeleton } from "@/shared/ui/Skeleton";
import { SnowtraceLink } from "@/shared/ui/SnowtraceLink";
import { Stamp } from "@/shared/ui/Stamp";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { isTerminal } from "../lib/timeline";
import { JobTimeline } from "./JobTimeline";

function headline(job: JobDetailDto): string {
  if (job.status === "confirmed") return `Safe: used ${formatPct(job.explanation?.budgetUsedPct ?? 0)} of today's limit`;
  if (job.status === "rejected") return "Shield 1 blocked this";
  // GS### is the Safe itself refusing a caller that is not an enabled module (attack #3), not the policy module.
  if (job.status === "reverted") return job.revertError?.startsWith("GS") ? "The Safe blocked this on-chain" : "Shield 2 blocked this on-chain";
  if (job.status === "failed") return "Infrastructure error";
  return "Auditing…";
}

/** The verdict for one job: stamp, plain-language explanation, source badge, pipeline timeline and the proof link. */
export function VerdictCard({ job, detailsTo, showTimes = false }: { job: JobDetailDto; detailsTo?: string; showTimes?: boolean }) {
  const done = isTerminal(job.status);
  const safe = job.status === "confirmed";
  const blocked = job.status === "rejected" || job.status === "reverted";
  const reason = job.reasonCode && job.reasonCode in REASONS ? REASONS[job.reasonCode as ReasonCode] : null;

  return (
    <Chamfer
      edge={safe ? "bg-accent" : blocked ? "bg-danger" : "bg-line-strong"}
      fill={blocked ? "bg-tint-pink" : "bg-surface"}
      code={`JOB ${shortAddress(job.id, 4, 4).toUpperCase()}`}
      innerClassName="p-4 pb-9 sm:p-5 sm:pb-10"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge job={job.status} />
        {done && (safe || blocked) && <Stamp tone={safe ? "ok" : "danger"}>{safe ? "Approved" : "Blocked"}</Stamp>}
      </div>

      <h3 className="mt-3 text-xl leading-tight">{headline(job)}</h3>

      <div className="mt-2 min-h-[3.5rem]" aria-live="polite">
        {job.explanation ? (
          <>
            <p className="text-sm text-soft">{job.explanation.messageVi}</p>
            <p className="mt-2">
              <span className="mono-label border border-line-strong px-1.5 py-0.5" title={job.explanation.source === "llm" ? "Wording written by the language model. The verdict is computed by rules." : "Wording from a fixed template. The verdict is computed by rules."}>
                {job.explanation.source === "llm" ? "LLM" : "TEMPLATE"}
              </span>
            </p>
          </>
        ) : job.status === "failed" ? (
          <p className="text-sm text-soft">Something broke on our side before a verdict. No funds moved. Try again in a moment.</p>
        ) : (
          <div className="space-y-2" aria-label="Writing the explanation">
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-8/12" />
          </div>
        )}
      </div>

      {reason && job.reasonCode && (
        <p className={cn("mt-3 border-l-4 px-3 py-2 text-xs", "border-danger bg-bg text-soft")}>
          <span className="font-mono font-bold text-danger-text">{job.reasonCode}</span>
          <span className="mx-2 text-muted">·</span>
          {reason.title}
        </p>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <JobTimeline job={job} showTimes={showTimes} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {job.txHash && <SnowtraceLink kind="tx" value={job.txHash}>{job.status === "reverted" ? "See the revert on Snowtrace" : "View on Snowtrace"}</SnowtraceLink>}
        {detailsTo && (
          <Link to={detailsTo} className="font-mono text-xs font-bold uppercase tracking-wider text-accent-text underline-offset-4 hover:underline">
            Open job page
          </Link>
        )}
      </div>
    </Chamfer>
  );
}
