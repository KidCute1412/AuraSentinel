import type { Explanation, JobStatus } from "@agentshield/shared";
import { formatReason } from "./reasonCopy";

/** What the UI prints under a verdict. `source: "rules"` = no explanation row, sentence from the reason code. */
export interface ShownExplanation {
  text: string;
  source: "llm" | "template" | "rules";
  budgetUsedPct: number | null;
}

interface JobLike {
  status: JobStatus;
  reasonCode?: string | null;
  revertError?: string | null;
  explanation: Explanation | null;
}

/** "13.3%" (en-US, trailing ".0" dropped). */
const pct = (p: number) => {
  const tenths = Math.round(Math.min(Math.max(p, 0), 100) * 10);
  return tenths % 10 === 0 ? `${tenths / 10}%` : `${Math.trunc(tenths / 10)}.${tenths % 10}%`;
};

/**
 * English sentence for a finished job. The UI is English only, but the server template writes
 * `messageVi` in Vietnamese, so template rows are re-worded here from the same deterministic facts
 * (status, reason code, budget %). LLM text is shown as written (the badge says so).
 * On-chain attacks never get an explanation row; a blocked job still reads from its reason code
 * instead of a skeleton that never resolves. Returns null while there is nothing final to say.
 */
export function explanationText(job: JobLike, params: { amount?: string } = {}): ShownExplanation | null {
  const e = job.explanation;
  const code = job.reasonCode ?? job.revertError ?? null;
  const blocked = job.status === "rejected" || job.status === "reverted";
  if (e?.source === "llm") return { text: e.messageVi, source: "llm", budgetUsedPct: e.budgetUsedPct };
  if (e) {
    const text =
      e.verdict === "safe"
        ? `Passed every check and the funds stayed in the vault. ${pct(e.budgetUsedPct)} of today's limit is now used.`
        : formatReason(code, params);
    return { text, source: "template", budgetUsedPct: e.budgetUsedPct };
  }
  if (blocked) return { text: formatReason(code, params), source: "rules", budgetUsedPct: null };
  return null;
}
