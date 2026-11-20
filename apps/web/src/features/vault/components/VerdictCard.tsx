import { Link } from "react-router-dom";
import type { JobDetailDto } from "@agentshield/shared";
import { REASONS, type ReasonCode } from "@/shared/api/mockEngine";
import { shortAddress } from "@/shared/lib/address";
import { explanationText } from "@/shared/lib/explanationText";
import { formatPct } from "@/shared/lib/format";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Skeleton } from "@/shared/ui/Skeleton";
import { SnowtraceLink } from "@/shared/ui/SnowtraceLink";
import { Stamp } from "@/shared/ui/Stamp";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { isTerminal } from "../lib/timeline";
import { AgentBrainCard, AttackStep } from "./AgentBrainCard";
import { ShieldPipeline } from "./ShieldPipeline";

function headline(job: JobDetailDto): string {
  if (job.status === "confirmed") return `Safe: used ${formatPct(job.explanation?.budgetUsedPct ?? 0)} of today's limit`;
  if (job.status === "rejected") return "Shield 1 blocked this";
  // GS### is the Safe itself refusing a caller that is not an enabled module (attack #3), not the policy module.
  if (job.status === "reverted") return job.revertError?.startsWith("GS") ? "The Safe blocked this on-chain" : "Shield 2 blocked this on-chain";
  if (job.status === "failed") return "Infrastructure error";
  if (job.status === "held") return job.agentPlan?.action.type === "none" ? "The hijacked agent did nothing" : "Held: inside your policy, never sent";
  return "Auditing…";
}

/**
 * The verdict for one job: stamp, plain-language explanation, source badge, pipeline timeline and the proof link.
 * A Hijacked Agent run also shows what the fooled AI decided, above the shields that judged it; `expectBrain` shows
 * its placeholder while the brain is still reading the feed (the page knows it started an injection).
 */
export function VerdictCard({ job, detailsTo, showTimes = false, expectBrain = false }: { job: JobDetailDto; detailsTo?: string; showTimes?: boolean; expectBrain?: boolean }) {
  const done = isTerminal(job.status);
  const held = job.status === "held";
  const safe = job.status === "confirmed" || held;
  const blocked = job.status === "rejected" || job.status === "reverted";
  const reason = job.reasonCode && job.reasonCode in REASONS ? REASONS[job.reasonCode as ReasonCode] : null;
  const shown = done ? explanationText(job) : null;
  const reasonChip = reason && job.reasonCode && (
    <span className="inline-flex items-center gap-2 border-l-4 border-danger bg-bg px-2 py-0.5 text-xs text-soft">
      <span className="font-mono font-bold text-danger-text">{job.reasonCode}</span>
      <span aria-hidden className="text-muted">·</span>
      {reason.title}
    </span>
  );

  return (
    <Chamfer
      edge={safe ? "bg-accent" : blocked ? "bg-danger" : "bg-line-strong"}
      fill={blocked ? "bg-tint-pink" : "bg-surface"}
      code={`JOB ${shortAddress(job.id, 4, 4).toUpperCase()}`}
      innerClassName="p-4 pb-9 sm:p-5 sm:pb-10"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge job={job.status} />
        {done && (safe || blocked) && <Stamp tone={safe ? "ok" : "danger"}>{held ? "Held" : safe ? "Approved" : "Blocked"}</Stamp>}
      </div>

      <h3 className="mt-3 text-xl leading-tight">{headline(job)}</h3>

      <div className="mt-2 min-h-[3.5rem]" aria-live="polite">
        {shown ? (
          <>
            <p className="text-sm text-soft">{shown.text}</p>
            {/* Who wrote the words, and the rule's code name for the technical reader, on one line. */}
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className="mono-label border border-line-strong px-1.5 py-0.5" title={shown.source === "llm" ? "Wording written by the language model. The verdict is computed by rules." : "Wording from a fixed template. The verdict is computed by rules."}>
                {shown.source === "llm" ? "LLM" : "TEMPLATE"}
              </span>
              {reasonChip}
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

      {!shown && reasonChip && <p className="mt-2">{reasonChip}</p>}

      {job.agentPlan || ((expectBrain || job.scenario === "prompt-injection") && !done) ? (
        // A hijack reads as a story: the bait, what the fooled AI planned, then the shields that judged it.
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          <p className="mono-label">How the attack went</p>
          <AgentBrainCard plan={job.agentPlan} />
          <AttackStep n={3} title="The shields">
            <ShieldPipeline job={job} variant={showTimes ? "full" : "compact"} />
          </AttackStep>
        </div>
      ) : (
        <div className="mt-5 border-t border-line pt-4">
          <ShieldPipeline job={job} variant={showTimes ? "full" : "compact"} />
        </div>
      )}

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
