import { ATTACK_EXPECTATIONS, JOB_TERMINAL_STATUSES, type AttackExpectation, type AttackScenario, type JobDetailDto } from "@agentshield/shared";

/**
 * What each red-team button is supposed to prove, read from ATTACK_EXPECTATIONS in @agentshield/shared (the same table
 * the server tests assert), so the page can never promise something the backend does not check.
 */

/** Display names, in demo order (system-design §5). */
export const ATTACK_TITLES: Record<AttackScenario, string> = {
  "over-withdraw": "Over-withdraw",
  "wrong-recipient": "Wrong recipient",
  "unlimited-approval": "Unlimited approval",
  bypass: "Bypass the website",
  "prompt-injection": "Prompt injection",
};

const STOPPER: Record<AttackExpectation["stoppedBy"], string> = {
  shield1: "Shield 1",
  shield2: "Shield 2",
  safe: "The Safe",
  "llm-guard": "Shield 1",
};

/** Short mono line under a button, e.g. "Stopped by Shield 2 · ExceedsPerTxCap · on-chain proof". */
export function expectationLine(scenario: AttackScenario): string {
  const e: AttackExpectation = ATTACK_EXPECTATIONS[scenario];
  const parts = [`Stopped by ${STOPPER[e.stoppedBy]}`];
  if (e.reasonCode) parts.push(e.reasonCode);
  if (e.onchainEvidence) parts.push("on-chain proof");
  if (e.stoppedBy === "llm-guard") parts.push("text ignored");
  return parts.join(" · ");
}

/** One sentence for the result card: what should happen and why it matters. */
export function expectationSentence(scenario: AttackScenario): string {
  const e: AttackExpectation = ATTACK_EXPECTATIONS[scenario];
  const code = e.reasonCode ? ` (${e.reasonCode})` : "";
  switch (e.stoppedBy) {
    case "shield1":
      return `Shield 1 should block it before anything is signed${code}. No transaction, no gas.`;
    case "shield2":
      return `Shield 2, the contract, should revert it on-chain${code}. The failed transaction is the proof.`;
    case "safe":
      return `The Safe should revert it on-chain${code}: the agent key is not an enabled module.`;
    case "llm-guard":
      return `The text is only data for the explainer. The same rules decide, so Shield 1 should still block it${code}.`;
  }
}

export type OutcomeCheck =
  | { kind: "pending" }
  /** Ended exactly as the table says. */
  | { kind: "expected"; label: string }
  /** Still blocked, but by another rule (for example the vault is locked, so PolicyInactive comes first). */
  | { kind: "blocked-other"; label: string }
  /** Not blocked, or no verdict at all. */
  | { kind: "unexpected"; label: string };

const blocked = (status: JobDetailDto["status"]) => status === "rejected" || status === "reverted";

/** Compare the job an attack created with ATTACK_EXPECTATIONS. Only a terminal status counts. */
export function checkOutcome(job: Pick<JobDetailDto, "status" | "reasonCode" | "revertError"> | undefined, scenario: AttackScenario): OutcomeCheck {
  if (!job || !(JOB_TERMINAL_STATUSES as readonly string[]).includes(job.status)) return { kind: "pending" };
  const e: AttackExpectation = ATTACK_EXPECTATIONS[scenario];
  const reason = job.reasonCode ?? job.revertError;
  if (job.status === e.status && (e.reasonCode === null || reason === e.reasonCode)) {
    return { kind: "expected", label: "Blocked as expected" };
  }
  if (blocked(job.status)) return { kind: "blocked-other", label: `Blocked by another rule${reason ? `: ${reason}` : ""}` };
  if (job.status === "failed") return { kind: "unexpected", label: "No verdict: infrastructure error" };
  return { kind: "unexpected", label: "Not blocked: report this as a bug" };
}
