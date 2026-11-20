import {
  ATTACK_EXPECTATIONS,
  JOB_TERMINAL_STATUSES,
  type AttackExpectation,
  type AttackScenario,
  type FixedAttackScenario,
  type JobDetailDto,
} from "@agentshield/shared";

/**
 * What each red-team button is supposed to prove, read from ATTACK_EXPECTATIONS in @agentshield/shared (the same table
 * the server tests assert), so the page can never promise something the backend does not check. A prompt injection
 * has no fixed outcome: the hijacked agent's brain writes its own plan, and the shields judge that plan.
 */

/** Display names, in demo order (system-design §5). */
export const ATTACK_TITLES: Record<AttackScenario, string> = {
  "over-withdraw": "Over-withdraw",
  "wrong-recipient": "Wrong recipient",
  "unlimited-approval": "Unlimited approval",
  bypass: "Bypass the website",
  "prompt-injection": "Hijack the agent's brain",
};

const STOPPER: Record<AttackExpectation["stoppedBy"], string> = {
  shield1: "Shield 1",
  shield2: "Shield 2",
  safe: "The Safe",
};

/** Short mono line under a button, e.g. "Stopped by Shield 2 · ExceedsPerTxCap · on-chain proof". */
export function expectationLine(scenario: FixedAttackScenario): string {
  const e: AttackExpectation = ATTACK_EXPECTATIONS[scenario];
  const parts = [`Stopped by ${STOPPER[e.stoppedBy]}`];
  if (e.reasonCode) parts.push(e.reasonCode);
  if (e.onchainEvidence) parts.push("on-chain proof");
  return parts.join(" · ");
}

/** The injection box's line: who decides, and the one promise that holds whatever the plan is. */
export const HIJACK_LINE = "The AI writes the plan · the shields judge it · never sent unless the chain refuses it";

/** One sentence for the result card: what should happen and why it matters. */
export function expectationSentence(scenario: AttackScenario): string {
  if (scenario === "prompt-injection") {
    return "The agent's AI reads your text and writes its own plan. Every shield judges that plan like any other trade: an attack is blocked, and a plan inside the policy is held, never sent.";
  }
  const e: AttackExpectation = ATTACK_EXPECTATIONS[scenario];
  const code = e.reasonCode ? ` (${e.reasonCode})` : "";
  switch (e.stoppedBy) {
    case "shield1":
      return `Shield 1 should block it before anything is signed${code}. No transaction, no gas.`;
    case "shield2":
      return `Shield 2, the contract, should revert it on-chain${code}. The failed transaction is the proof.`;
    case "safe":
      return `The Safe should revert it on-chain${code}: the agent key is not an enabled module.`;
  }
}

export type OutcomeCheck =
  | { kind: "pending" }
  /** Ended exactly as the table says (for a hijack: blocked, or held inside the policy). */
  | { kind: "expected"; label: string }
  /** Still blocked, but by another rule (for example the vault is locked, so PolicyInactive comes first). */
  | { kind: "blocked-other"; label: string }
  /** Not blocked, or no verdict at all. */
  | { kind: "unexpected"; label: string };

const blocked = (status: JobDetailDto["status"]) => status === "rejected" || status === "reverted";

/** Compare the job an attack created with what it should prove. Only a terminal status counts. */
export function checkOutcome(job: Pick<JobDetailDto, "status" | "reasonCode" | "revertError"> | undefined, scenario: AttackScenario): OutcomeCheck {
  if (!job || !(JOB_TERMINAL_STATUSES as readonly string[]).includes(job.status)) return { kind: "pending" };
  if (job.status === "failed") return { kind: "unexpected", label: "No verdict: infrastructure error" };
  if (scenario === "prompt-injection") {
    if (blocked(job.status)) return { kind: "expected", label: "Blocked: the hijack failed" };
    if (job.status === "held") return { kind: "expected", label: "Held: inside the policy, never sent" };
    return { kind: "unexpected", label: "Not blocked: report this as a bug" };
  }
  const e: AttackExpectation = ATTACK_EXPECTATIONS[scenario];
  const reason = job.reasonCode ?? job.revertError;
  if (job.status === e.status && (e.reasonCode === null || reason === e.reasonCode)) {
    return { kind: "expected", label: "Blocked as expected" };
  }
  if (blocked(job.status)) return { kind: "blocked-other", label: `Blocked by another rule${reason ? `: ${reason}` : ""}` };
  // Fixed attacks are red-team runs too: one a looser policy lets through is held, never sent, but it is still a miss.
  if (job.status === "held") return { kind: "unexpected", label: "Not blocked by a shield (held, never sent): check the policy" };
  return { kind: "unexpected", label: "Not blocked: report this as a bug" };
}
