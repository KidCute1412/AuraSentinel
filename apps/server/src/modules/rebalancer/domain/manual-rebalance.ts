import { clampAmount, type TokenBudget } from './rebalance.math';

export const BPS = 10_000n;

/** Slippage tolerance of a manual rebalance (POST /vaults/{safe}/jobs): 1%. */
export const MANUAL_SLIPPAGE_BPS = 100n;

/**
 * Amount actually swapped for a manual rebalance (api.md #10): the client only suggests it,
 * we clamp to min(requested, maxPerTx, dailyCap - spentToday).
 *
 * When nothing is left today the request is passed through unclamped, so the Auditor rejects it
 * with ExceedsDailyCap and the user sees why (a red card is data, not an HTTP error).
 */
export function manualAmount(requested: bigint, budget: TokenBudget): bigint {
  const clamped = clampAmount(requested, budget);
  return clamped > 0n ? clamped : requested;
}

/**
 * minOut from a router quote: quotedOut * (1 - slippage), rounded down. A zero quote stays zero
 * and precheck rejects it (ZeroMinOut) instead of trading blind.
 */
export function minOutFromQuote(quotedOut: bigint, slippageBps: bigint = MANUAL_SLIPPAGE_BPS): bigint {
  if (quotedOut <= 0n) return 0n;
  if (slippageBps < 0n || slippageBps >= BPS) throw new RangeError('slippageBps must be in [0, 10000)');
  return (quotedOut * (BPS - slippageBps)) / BPS;
}
