import type { SwapIntent } from '../../../core/types';

/** Per-token limits and today's spend, read from the chain (P1, C1). Base units. */
export interface TokenBudget {
  maxPerTx: bigint;
  dailyCap: bigint;
  /** spentInDay[token][today] for the current policy epoch. */
  spentToday: bigint;
}

export interface RebalanceInput {
  /** Base-unit balances of the Safe. */
  balanceA: bigint;
  balanceB: bigint;
  /** Value of 1 base unit of A in base units of B, scaled 1e18 (see priceFromQuote). */
  priceAInB: bigint;
  /** Rebalance only when |deviation| from 50/50 exceeds this many basis points of NAV. */
  thresholdBps: bigint;
  /** Limits of the token that would be sold. Caps are per token, never shared (C1). */
  budgetA: TokenBudget;
  budgetB: TokenBudget;
  tokenA: SwapIntent['tokenIn'];
  tokenB: SwapIntent['tokenIn'];
  /** Always the Safe itself. */
  recipient: SwapIntent['recipient'];
  slippageBps: bigint;
}

export const PRICE_SCALE = 10n ** 18n;
const BPS = 10_000n;

/** What is left of today's budget: max(dailyCap - spentToday, 0). */
export const remainingToday = (b: TokenBudget): bigint =>
  b.dailyCap > b.spentToday ? b.dailyCap - b.spentToday : 0n;

/** amountIn = min(wanted, maxPerTx, dailyCap - spentToday) (auditor-pipeline skill). */
export function clampAmount(wanted: bigint, b: TokenBudget): bigint {
  let amount = wanted;
  if (amount > b.maxPerTx) amount = b.maxPerTx;
  const left = remainingToday(b);
  if (amount > left) amount = left;
  return amount > 0n ? amount : 0n;
}

/**
 * Price from a router quote (D8): getAmountsOut(sampleIn) on the same pool the swap will use,
 * so "computed" and "filled" prices agree. Returns null when the quote rounds to zero (pool too
 * thin for this sample); the caller then skips the vault rather than trading blind.
 */
export function priceFromQuote(sampleIn: bigint, amountOut: bigint): bigint | null {
  if (sampleIn <= 0n || amountOut <= 0n) return null;
  return (amountOut * PRICE_SCALE) / sampleIn;
}

/**
 * Sample size for the quote: `tokens` whole tokens of A. Large enough that a thin pool does not
 * round the output to zero (D8); 1 token of a 6-decimal stable is 1e6 base units.
 */
export const quoteSample = (decimals: number, tokens = 100n): bigint => tokens * 10n ** BigInt(decimals);

/**
 * Pure math, no LLM. Returns the swap that moves the Safe back toward 50/50, clamped so it
 * never exceeds the per-tx cap or what is left of today's budget for the token sold, or null
 * when nothing should be traded (within threshold, no budget left, or too small to quote).
 */
export function computeRebalance(i: RebalanceInput): SwapIntent | null {
  if (i.priceAInB <= 0n) return null;
  const valueA = (i.balanceA * i.priceAInB) / PRICE_SCALE; // A valued in B
  const total = valueA + i.balanceB;
  if (total === 0n) return null;

  const diff = valueA - i.balanceB; // > 0: overweight A
  const absDiff = diff < 0n ? -diff : diff;
  if ((absDiff * BPS) / total <= i.thresholdBps) return null;

  const half = absDiff / 2n; // value to move, in B units
  const sellA = diff > 0n;
  const wanted = sellA ? (half * PRICE_SCALE) / i.priceAInB : half;
  const amountIn = clampAmount(wanted, sellA ? i.budgetA : i.budgetB);
  if (amountIn === 0n) return null;

  const expectedOut = sellA ? (amountIn * i.priceAInB) / PRICE_SCALE : (amountIn * PRICE_SCALE) / i.priceAInB;
  const minAmountOut = (expectedOut * (BPS - i.slippageBps)) / BPS;
  if (minAmountOut === 0n) return null; // the module rejects minOut = 0 (C3)

  return {
    tokenIn: sellA ? i.tokenA : i.tokenB,
    tokenOut: sellA ? i.tokenB : i.tokenA,
    amountIn,
    minAmountOut,
    recipient: i.recipient,
    origin: 'rebalancer',
  };
}
