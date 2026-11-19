import { DEMO_NORMAL_TRADE, DEMO_TRADE_MAX, JOB_TERMINAL_STATUSES, type JobDetailDto, type StateDto } from "@agentshield/shared";
import { formatTokenAmount } from "@/shared/lib/format";
import { REASONS, spentUsdc, usdcLimit, type JobSpec, type ReasonCode } from "@/shared/api/mockEngine";
import { checkOutcome } from "../lib/attacks";
import { parseLimit } from "../lib/policyForm";
import type { TourStep } from "../lib/tour";

/**
 * The Guided mode of /demo: four plain-language steps, one at a time, each with its own button and its result shown
 * right under it. The ids match lib/tour (tourProgress), so a step done in Free play counts here too.
 */

export type GuidedId = TourStep["id"];

export interface GuidedStep {
  id: GuidedId;
  /** Short name in the step rail. */
  short: string;
  title: string;
  /** What is about to happen, for someone who has never used a blockchain. */
  story: string;
  /** What should happen, said before the press so the result can be checked against it. */
  expect: string;
  /** The button. */
  cta: string;
  /** The job the button starts; null for the Kill-Switch (signed in a wallet, not a server job). */
  spec: JobSpec | null;
}

/** The usual normal trade (20 USDC): small, because every visitor shares the demo vault's daily limit. */
const NORMAL_TRADE = DEMO_NORMAL_TRADE;
const ONE_USDC = 1_000_000n;
/** The visitor may pick 1 to 100 USDC (the server clamps the shared demo vault to 100 too). */
export const TRADE_MIN = ONE_USDC;
export const TRADE_MAX = DEMO_TRADE_MAX;
/** One-tap amounts next to the field. */
export const TRADE_PRESETS = ["10", "20", "50", "100"] as const;

const leftToday = (state: StateDto): bigint => {
  const { dailyCap } = usdcLimit(state);
  return dailyCap > spentUsdc(state) ? dailyCap - spentUsdc(state) : 0n;
};

/**
 * The normal trade, sized so it really is normal today: 20 USDC, or less when the shared demo vault has less than
 * that left of its daily limit (whole USDC). With under 1 USDC left it stays 20 and the result says the budget is used up.
 */
export function normalTradeAmount(state: StateDto | null): bigint {
  if (!state) return NORMAL_TRADE;
  const { maxPerTx } = usdcLimit(state);
  const fit = [NORMAL_TRADE, leftToday(state), maxPerTx].reduce((a, b) => (b < a ? b : a));
  const whole = (fit / ONE_USDC) * ONE_USDC;
  return whole >= ONE_USDC ? whole : NORMAL_TRADE;
}

/**
 * The amount the visitor typed for the normal trade: 1 to 100 USDC, and no more than the shared vault has left today
 * (a normal trade should stay normal; "take too much" is step 2). Errors are short, shown under the field.
 */
export function checkTradeAmount(text: string, state: StateDto | null): { value: bigint } | { error: string } {
  const parsed = parseLimit(text, 6);
  if ("error" in parsed) return parsed;
  if (parsed.value < TRADE_MIN) return { error: "At least 1 USDC" };
  if (parsed.value > TRADE_MAX) return { error: `At most ${formatTokenAmount(TRADE_MAX, 6)} USDC on this shared demo vault` };
  if (state) {
    const left = leftToday(state);
    if (left >= TRADE_MIN && parsed.value > left) return { error: `Only ${formatTokenAmount(left, 6)} USDC left today on this shared vault` };
  }
  return parsed;
}

/** Step 1 with the amount filled in (the other steps are fixed). `amount`: what the visitor picked, else the default. */
export function stepFor(step: GuidedStep, state: StateDto | null, picked?: bigint): GuidedStep {
  if (step.id !== "rebalance") return step;
  const amount = picked ?? normalTradeAmount(state);
  const shown = formatTokenAmount(amount, 6);
  return {
    ...step,
    story: `The agent swaps ${shown} USDC for WAVAX, the kind of trade it makes on its own all day. That is inside its limits.`,
    spec: { type: "rebalance", amountIn: amount },
  };
}

export const GUIDED_STEPS: readonly GuidedStep[] = [
  {
    id: "rebalance",
    short: "Normal trade",
    title: "Let the AI make a normal trade",
    story: "The agent swaps 20 USDC for WAVAX, the kind of trade it makes on its own all day. That is inside its limits.",
    expect: "Both checks let it through and the trade lands on the blockchain.",
    cta: "Make the trade",
    spec: { type: "rebalance", amountIn: NORMAL_TRADE },
  },
  {
    id: "over-withdraw",
    short: "Take too much",
    title: "Now ask it to take too much",
    story: "Pretend the AI was tricked. It tries to move 2,000 USDC in one go, four times its limit.",
    expect: "The pre-check refuses before anything is signed. No transaction, no gas spent.",
    cta: "Try to take 2,000 USDC",
    spec: { type: "attack", scenario: "over-withdraw" },
  },
  {
    id: "bypass",
    short: "Hack around",
    title: "Skip the website and hack the chain directly",
    story: "Worst case: our server is hacked, so the pre-check is gone. The agent sends the bad trade straight to the blockchain.",
    expect: "The contract on the blockchain still refuses it. The failed transaction is public proof.",
    cta: "Bypass the website",
    spec: { type: "attack", scenario: "bypass" },
  },
  {
    id: "kill",
    short: "Emergency stop",
    title: "Pull the emergency stop",
    story: "The owner can lock the agent out at any time with one signature from their own wallet. It works even if our server is down.",
    expect: "The agent is locked out on the blockchain. Every later trade is refused.",
    cta: "Hold to lock the agent",
    spec: null,
  },
];

export type StepResult =
  | { kind: "idle" }
  | { kind: "running" }
  /** Ended the way the step promised. */
  | { kind: "pass"; tone: "ok" | "danger"; stamp: string; headline: string; detail: string }
  /** Ended, but not the way the step promised (still honest: we say what happened). */
  | { kind: "other"; headline: string; detail: string };

const reasonSentence = (code: string | null | undefined): string | null =>
  code && code in REASONS ? REASONS[code as ReasonCode].sentence : null;

/** What the job started by a step means, in plain words. Verdicts come from the job (rules), never from this text. */
export function stepResult(id: GuidedId, job: Pick<JobDetailDto, "status" | "reasonCode" | "revertError"> | undefined): StepResult {
  if (!job) return { kind: "idle" };
  if (!(JOB_TERMINAL_STATUSES as readonly string[]).includes(job.status)) return { kind: "running" };
  if (job.status === "failed") {
    return { kind: "other", headline: "Something broke on our side", detail: "No verdict and no funds moved. Wait a few seconds and try again." };
  }
  if (id === "rebalance") {
    if (job.status === "confirmed") {
      return { kind: "pass", tone: "ok", stamp: "Approved", headline: "Approved. The trade is on the blockchain.", detail: "Inside the limits, so both checks agreed. The vault balances below just changed." };
    }
    return {
      kind: "other",
      headline: "This one was blocked",
      detail: reasonSentence(job.reasonCode ?? job.revertError) ?? "A rule refused it. On the shared demo vault the daily budget may already be used up; the next steps still work.",
    };
  }
  if (id === "over-withdraw" || id === "bypass") {
    const check = checkOutcome(job, id);
    if (check.kind === "expected") {
      return id === "over-withdraw"
        ? { kind: "pass", tone: "danger", stamp: "Blocked", headline: "Blocked before anything was signed.", detail: "2,000 USDC is over the 500 USDC per-trade limit. The pre-check stopped it, so not even a transaction was sent." }
        : { kind: "pass", tone: "danger", stamp: "Blocked on-chain", headline: "Blocked by the contract on the blockchain.", detail: "With the pre-check gone, the contract itself refused the trade. Anyone can verify the failed transaction." };
    }
    if (check.kind === "blocked-other") {
      return { kind: "pass", tone: "danger", stamp: "Blocked", headline: "Blocked, by another rule.", detail: reasonSentence(job.reasonCode ?? job.revertError) ?? check.label };
    }
    return { kind: "other", headline: "Not blocked", detail: "This should never happen. Please tell the team." };
  }
  return { kind: "idle" };
}

/** Which steps are done: what the visitor did this visit (tourProgress), or a step that passed here. */
export function doneSteps(tour: readonly TourStep[] | null, passed: ReadonlySet<GuidedId>): Set<GuidedId> {
  const done = new Set<GuidedId>(passed);
  for (const s of tour ?? []) if (s.done) done.add(s.id);
  return done;
}

/** The step to show: the first one not done, or the last one when all are. */
export function firstOpenStep(done: ReadonlySet<GuidedId>): number {
  const i = GUIDED_STEPS.findIndex((s) => !done.has(s.id));
  return i === -1 ? GUIDED_STEPS.length - 1 : i;
}
