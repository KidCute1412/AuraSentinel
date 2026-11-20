import { describeAction, type AgentPlan, type Explanation, type JobDto, type JobStatus } from "@agentshield/shared";
import { amountLabel } from "./jobLabel";
import { formatReason } from "./reasonCopy";

/** What the UI prints under a verdict. `source: "rules"` = no explanation row, sentences from the reason code. */
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
  /** When present, the story names what was traded and what a hijacked agent tried. */
  intent?: JobDto["intent"];
  origin?: JobDto["origin"];
  agentPlan?: AgentPlan | null;
}

/** Why a red-team plan that passed every shield is still not on the chain. */
export const HELD_TEXT =
  "Inside your policy, so every shield let it through. Red-team runs are never sent, so nothing moved: the worst a hijacked agent can do is a trade you already allowed.";

/** "13.3%" (en-US, trailing ".0" dropped). */
const pct = (p: number) => {
  const tenths = Math.round(Math.min(Math.max(p, 0), 100) * 10);
  return tenths % 10 === 0 ? `${tenths / 10}%` : `${Math.trunc(tenths / 10)}.${tenths % 10}%`;
};

/** Which layer answered, in one sentence. */
function stopper(status: JobStatus, code: string | null): string {
  if (status === "rejected") return "Shield 1 stopped it on our server, before anything was signed.";
  if (code?.startsWith("GS")) return "The Safe refused it on-chain: the agent key is not one of its enabled modules.";
  return "Shield 2, the contract itself, refused it on-chain, so the transaction reverted.";
}

/**
 * English explanation for a finished job. The UI is English only, but the server template writes `messageVi` in
 * Vietnamese, so template rows (and on-chain blocks, which have no row) are told here from the same deterministic
 * facts: what was tried (a hijacked agent's plan, or the amount), which layer and rule answered, and what it means for
 * the money. LLM text is shown as written (the badge says so). Returns null while there is nothing final to say.
 */
export function explanationText(job: JobLike, params: { amount?: string } = {}): ShownExplanation | null {
  const e = job.explanation;
  const code = job.reasonCode ?? job.revertError ?? null;
  const blocked = job.status === "rejected" || job.status === "reverted";
  const amount = params.amount ?? (job.intent ? (amountLabel({ intent: job.intent, origin: job.origin ?? "manual", agentPlan: job.agentPlan }) ?? undefined) : undefined);
  const plan = job.agentPlan;
  const fooled = plan && plan.action.type !== "none" ? `A fake message fooled the agent's AI, and it tried to ${describeAction(plan.action)}.` : null;

  // A held red-team plan: the server only ever writes the template for it (an LLM could claim it was sent).
  if (job.status === "held") {
    const lead = plan?.action.type === "none" ? "The agent's AI read the message and chose to do nothing." : fooled;
    return { text: [lead, HELD_TEXT].filter(Boolean).join(" "), source: e ? "template" : "rules", budgetUsedPct: e?.budgetUsedPct ?? null };
  }
  if (e?.source === "llm") return { text: e.messageVi, source: "llm", budgetUsedPct: e.budgetUsedPct };

  if (blocked) {
    const lead = fooled ?? (amount ? `The agent asked to trade ${amount}.` : null);
    const text = [lead, stopper(job.status, code), formatReason(code, { amount }), "No funds left the vault."].filter(Boolean).join(" ");
    return { text, source: e ? "template" : "rules", budgetUsedPct: e?.budgetUsedPct ?? null };
  }
  if (e) {
    const what = amount ? `The agent traded ${amount} inside its limits.` : "The trade stayed inside the agent's limits.";
    const text = `${what} Every check passed and the proceeds came back to the vault. ${pct(e.budgetUsedPct)} of today's limit is now used.`;
    return { text, source: "template", budgetUsedPct: e.budgetUsedPct };
  }
  return null;
}
