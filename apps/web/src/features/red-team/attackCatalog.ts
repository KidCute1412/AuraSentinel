import {
  ATTACK_EXPECTATIONS,
  TOKEN_DECIMALS,
  parseUnits,
  type AttackExpectation,
  type AttackScenario,
  type JobDto,
} from "@agentshield/shared";
import { reasonTitle } from "@/shared/lib/reasonCopy";

/** Default demo rebalance: 200 USDC in base units (glossary: 200 = 13.3% of the 1,500 daily cap). */
export const DEMO_REBALANCE_USDC = "200";
export const DEMO_REBALANCE_AMOUNT = parseUnits(DEMO_REBALANCE_USDC, TOKEN_DECIMALS.USDC).toString();

export type ButtonAttack = Exclude<AttackScenario, "prompt-injection">;

export interface AttackCopy {
  scenario: ButtonAttack;
  index: string;
  title: string;
  /** What the attack really does (system-design §5). */
  description: string;
}

/** The 4 attack buttons, in demo order. Copy describes the real action; the outcome copy comes from ATTACK_EXPECTATIONS. */
export const ATTACKS: readonly AttackCopy[] = [
  { scenario: "over-withdraw", index: "#1", title: "Over-withdraw", description: "Sends a 2,000 USDC order, 4× the per-transaction cap." },
  { scenario: "wrong-recipient", index: "#2", title: "Wrong recipient", description: "The order tries to send the funds to the attacker's wallet instead of the vault." },
  { scenario: "unlimited-approval", index: "#3", title: "Unlimited approval", description: "The agent key calls the Safe directly to approve an unlimited allowance." },
  { scenario: "bypass", index: "#4", title: "Bypass the website", description: "Signs the order and sends it straight to the contract, skipping Shield 1 entirely." },
];

const STOPPER: Record<Exclude<AttackExpectation["stoppedBy"], "llm-guard">, string> = {
  shield1: "Stopped by Shield 1",
  shield2: "Stopped by Shield 2",
  safe: "Stopped by the Safe",
};

const blocks = (e: AttackExpectation) => e.status === "rejected" || e.status === "reverted";

/**
 * "Stopped by Shield 2 · Over the per-transaction cap · Snowtrace link". Built from ATTACK_EXPECTATIONS so the
 * panel can never promise something the server tests do not check.
 */
export function expectationLabel(scenario: AttackScenario): string {
  const e: AttackExpectation = ATTACK_EXPECTATIONS[scenario];
  if (e.stoppedBy === "llm-guard") {
    return blocks(e) ? "LLM has no authority: still blocked" : "LLM has no authority: same result";
  }
  // A Safe reason title already names the Safe ("Refused by the Safe (GS104)"); do not say it twice.
  const parts = e.stoppedBy === "safe" && e.reasonCode ? [] : [STOPPER[e.stoppedBy]];
  if (e.reasonCode) parts.push(reasonTitle(e.reasonCode));
  if (e.onchainEvidence) parts.push("Snowtrace link");
  return parts.join(" · ");
}

export type Outcome =
  | { kind: "pending" }
  | { kind: "expected"; label: string }
  | { kind: "unexpected"; label: string };

/**
 * Compares the job the server created for an attack with what ATTACK_EXPECTATIONS promises.
 * Only a terminal status counts; the reason must match too when one is expected.
 */
export function compareOutcome(job: JobDto | undefined, scenario: AttackScenario): Outcome {
  if (!job || !["confirmed", "rejected", "reverted", "failed"].includes(job.status)) return { kind: "pending" };
  const e: AttackExpectation = ATTACK_EXPECTATIONS[scenario];
  const reason = job.reasonCode ?? job.revertError;
  const statusOk = job.status === e.status;
  const reasonOk = e.reasonCode === null || reason === e.reasonCode;
  if (statusOk && reasonOk) {
    return { kind: "expected", label: blocks(e) ? "Blocked as expected" : "As expected" };
  }
  return { kind: "unexpected", label: `Not as expected: ${job.status}${reason ? ` · ${reason}` : ""}` };
}
