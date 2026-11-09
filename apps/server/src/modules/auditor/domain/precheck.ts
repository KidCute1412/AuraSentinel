import type { ReasonCode } from '@agentshield/shared';
import type { SwapIntent } from '../../../core/types';

export interface TokenLimit {
  token: string;
  maxPerTx: bigint;
  dailyCap: bigint;
}

export interface TokenSpent {
  token: string;
  amount: bigint;
}

/**
 * Everything precheck needs, read from the chain in one go (P1, D4). Limits and spend are
 * per token (C1); `now` is the block timestamp read with that state, not the server clock.
 */
export interface PrecheckSnapshot {
  /** The vault. The only allowed recipient. */
  safe: string;
  /** Address that will sign executeGuardedSwap (the session key). */
  signer: string;
  /** Block timestamp in unix seconds. */
  now: bigint;
  policy: {
    agentSigner: string;
    isActive: boolean;
    /** Unix seconds (uint64 on chain). */
    expiry: bigint;
  };
  limits: readonly TokenLimit[];
  /** spentInDay[token][today] for the current policy epoch. Missing token means 0. */
  spentToday: readonly TokenSpent[];
}

export interface PrecheckResult {
  ok: boolean;
  /** Every failed check, most important first. reasons[0] is the job's reasonCode. */
  reasons: ReasonCode[];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const findLimit = (limits: readonly TokenLimit[], token: string): TokenLimit | undefined =>
  limits.find((l) => same(l.token, token));

export const spentFor = (spent: readonly TokenSpent[], token: string): bigint =>
  spent.find((s) => same(s.token, token))?.amount ?? 0n;

/** A token is whitelisted when its dailyCap is above zero (contracts.md §2). */
const isWhitelisted = (limits: readonly TokenLimit[], token: string): boolean =>
  (findLimit(limits, token)?.dailyCap ?? 0n) > 0n;

/**
 * Shield 1, step (a). Pure and deterministic.
 *
 * Mirrors the gates of AgentPolicyModule.executeGuardedSwap in the contract's order
 * (contracts.md §4), so reasons[0] is the error Shield 2 would revert with. Then adds the
 * intent checks the module ABI cannot express (recipient). Unlike the contract it does not
 * stop at the first failure: all reasons are reported for the audit log.
 *
 * Not checked here: the deadline (the calldata builder sets it, not the intent) and the
 * gate 5 execution results (the simulator and post-sim invariants cover those).
 *
 * Keep in sync with packages/contracts when L2 lands: if the module checks SameToken before
 * the whitelist, swap the two lines below and the order test.
 */
export function precheck(intent: SwapIntent, s: PrecheckSnapshot): PrecheckResult {
  const reasons: ReasonCode[] = [];

  // Gate 1: who and when
  if (!same(s.signer, s.policy.agentSigner)) reasons.push('UnauthorizedAgent');
  if (!s.policy.isActive) reasons.push('PolicyInactive');
  if (s.now > s.policy.expiry) reasons.push('PolicyExpired');

  // Gate 2: which tokens
  const tokensAllowed = isWhitelisted(s.limits, intent.tokenIn) && isWhitelisted(s.limits, intent.tokenOut);
  if (!tokensAllowed) reasons.push('TokenNotWhitelisted');
  if (same(intent.tokenIn, intent.tokenOut)) reasons.push('SameToken');

  // Gates 3-4: how much. Caps of a token that is not whitelisted are meaningless, skip them.
  const limit = findLimit(s.limits, intent.tokenIn);
  if (tokensAllowed && limit) {
    if (intent.amountIn > limit.maxPerTx) reasons.push('ExceedsPerTxCap');
    if (spentFor(s.spentToday, intent.tokenIn) + intent.amountIn > limit.dailyCap) {
      reasons.push('ExceedsDailyCap');
    }
  }
  if (intent.minAmountOut <= 0n) reasons.push('ZeroMinOut');

  // Intent: the module has no recipient parameter, so only Shield 1 can catch this (attack #2).
  if (!same(intent.recipient, s.safe)) reasons.push('RECIPIENT_NOT_SAFE');

  return { ok: reasons.length === 0, reasons };
}
