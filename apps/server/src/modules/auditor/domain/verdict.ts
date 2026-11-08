import { toReasonCode, type ReasonCode } from '@agentshield/shared';
import type { InvariantResult } from './invariants';
import type { PrecheckResult } from './precheck';

/** Which Shield 1 step blocked the intent. Matches AuditEntry.shield in packages/shared. */
export type AuditStage = 'precheck' | 'simulation' | 'invariant';

/** What the simulator step produced. Absent when precheck failed and the sim was skipped. */
export type SimStep =
  | { reverted: true; /** Decoded error name or raw revert string. */ revertReason?: string | null }
  | { reverted: false; invariants: InvariantResult };

export interface VerdictInput {
  precheck: PrecheckResult;
  sim?: SimStep;
}

export type Verdict =
  | { verdict: 'safe'; reasonCode: null; stage: null }
  | { verdict: 'blocked'; reasonCode: ReasonCode; stage: AuditStage };

const blocked = (reasonCode: ReasonCode, stage: AuditStage): Verdict => ({
  verdict: 'blocked',
  reasonCode,
  stage,
});

/**
 * Deterministic verdict (P3: never from the LLM). Fails closed: "safe" needs a passing
 * precheck AND a simulation that ran without reverting AND every invariant holding.
 */
export function decideVerdict({ precheck, sim }: VerdictInput): Verdict {
  if (!precheck.ok) return blocked(precheck.reasons[0] ?? 'UNKNOWN_REVERT', 'precheck');
  if (!sim) return blocked('UNKNOWN_REVERT', 'simulation');
  if (sim.reverted) return blocked(toReasonCode(sim.revertReason), 'simulation');
  if (!sim.invariants.ok) {
    return blocked(sim.invariants.reasons[0] ?? 'UNKNOWN_REVERT', 'invariant');
  }
  return { verdict: 'safe', reasonCode: null, stage: null };
}

export const BPS = 10_000n;

export interface BudgetInput {
  verdict: Verdict['verdict'];
  /** spentInDay[tokenIn][today] read from the chain before this swap. */
  spentToday: bigint;
  amountIn: bigint;
  dailyCap: bigint;
}

/**
 * Share of today's budget for tokenIn, in basis points (1333n = 13.33%), clamped to
 * [0, 10000]. A safe swap counts its own amount; a blocked one does not, since no money
 * moves. A token with no cap counts as fully used. Integer math, rounds down.
 */
export function budgetUsedBps({ verdict, spentToday, amountIn, dailyCap }: BudgetInput): bigint {
  if (dailyCap <= 0n) return BPS;
  const used = verdict === 'safe' ? spentToday + amountIn : spentToday;
  if (used <= 0n) return 0n;
  const bps = (used * BPS) / dailyCap;
  return bps > BPS ? BPS : bps;
}

/**
 * Explanation.budgetUsedPct (0-100, one decimal, display only): 1333n -> 13.3.
 * The input is bounded to 0-10000, so turning it into a number is safe. Never use it for money.
 */
export const bpsToPct = (bps: bigint): number => Number(bps / 10n) / 10;

/** Vietnamese display: 1333n -> "13,3%", 5000n -> "50%". */
export function formatPctVi(bps: bigint): string {
  const whole = bps / 100n;
  const tenth = (bps % 100n) / 10n;
  return tenth === 0n ? `${whole}%` : `${whole},${tenth}%`;
}
