import type { Explanation, JobStatus } from "@agentshield/shared";
import { cn } from "@/shared/lib/cn";
import { explanationText } from "@/shared/lib/explanationText";
import { formatBudgetPct } from "../jobView";

interface ExplanationCardProps {
  explanation: Explanation | null;
  status: JobStatus;
  terminal: boolean;
  /** Reason behind a block: the sentence when there is no explanation row (on-chain attacks). */
  reasonCode?: string | null;
  revertError?: string | null;
  /** Formatted order amount ("2,000 USDC") for the reason sentence. */
  amount?: string | null;
}

/**
 * Verdict explanation (design-system §4). The box keeps the same frame and minimum height in
 * every state, so when `job.explained` lands after the job is final the text swaps in place
 * instead of pushing the timeline around. The verdict comes from code; only the sentence may
 * come from the LLM, hence the LLM/TEMPLATE badge.
 */
export function ExplanationCard({ explanation, status, terminal, reasonCode, revertError, amount }: ExplanationCardProps) {
  const shown = terminal ? explanationText({ status, explanation, reasonCode, revertError }, { amount: amount ?? undefined }) : null;
  const blocked = explanation?.verdict === "blocked" || (!!shown && (status === "rejected" || status === "reverted"));
  return (
    <div
      data-testid="explanation-card"
      aria-live="polite"
      className={cn(
        "min-h-28 border p-4",
        !shown && "border-dashed border-line-strong bg-bg",
        shown && !blocked && "border-accent bg-bg",
        blocked && "border-danger bg-tint-pink",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="mono-label">Explanation</span>
        {/* ink is cream in dark and near-black in light; text-bg keeps the contrast in both themes. */}
        {shown && (
          <span className="bg-ink px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-bg">
            {shown.source === "llm" ? "LLM" : "TEMPLATE"}
          </span>
        )}
      </div>
      {shown ? (
        <>
          <p className="mt-2 text-base leading-relaxed sm:text-lg">{shown.text}</p>
          {shown.budgetUsedPct !== null && (
            <p className="mt-2 font-mono text-xs text-muted">
              Daily budget used: <span className="tabular text-fg">{formatBudgetPct(shown.budgetUsedPct)}</span>
            </p>
          )}
        </>
      ) : (
        <Pending status={status} terminal={terminal} />
      )}
    </div>
  );
}

function Pending({ status, terminal }: { status: JobStatus; terminal: boolean }) {
  if (status === "failed") return <p className="mt-2 text-soft">The order failed on infrastructure, so there is no explanation.</p>;
  if (!terminal) return <p className="mt-2 text-soft">The explanation appears once the order finishes.</p>;
  return (
    <div className="mt-2">
      <p className="text-soft">Writing the explanation…</p>
      <div aria-hidden className="mt-3 space-y-2">
        <div className="h-3 w-11/12 animate-pulse bg-hover" />
        <div className="h-3 w-3/4 animate-pulse bg-hover" />
      </div>
    </div>
  );
}
