import type { SwapIntent } from '../../../core/types';

export interface RebalanceInput {
  /** Base-unit balances of the Safe. */
  balanceA: bigint;
  balanceB: bigint;
  /** Price of A in B, scaled 1e18 (no floats). */
  priceAInB: bigint;
  /** Rebalance when |deviation| from 50/50 exceeds this many basis points. */
  thresholdBps: bigint;
  maxPerTx: bigint;
  tokenA: SwapIntent['tokenIn'];
  tokenB: SwapIntent['tokenIn'];
  recipient: SwapIntent['recipient'];
  slippageBps: bigint;
}

const SCALE = 10n ** 18n;
const BPS = 10_000n;

/** Pure math, no LLM. Returns null when the portfolio is within threshold. */
export function computeRebalance(i: RebalanceInput): SwapIntent | null {
  const valueA = (i.balanceA * i.priceAInB) / SCALE; // A valued in B
  const total = valueA + i.balanceB;
  if (total === 0n) return null;

  const diff = valueA - i.balanceB; // >0 => overweight A
  const absDiff = diff < 0n ? -diff : diff;
  if ((absDiff * BPS) / total <= i.thresholdBps) return null;

  const half = absDiff / 2n; // value to move, in B units
  const sellA = diff > 0n;
  let amountIn = sellA ? (half * SCALE) / i.priceAInB : half;
  if (amountIn > i.maxPerTx) amountIn = i.maxPerTx; // clamp
  if (amountIn === 0n) return null;

  const expectedOut = sellA ? (amountIn * i.priceAInB) / SCALE : (amountIn * SCALE) / i.priceAInB;
  return {
    tokenIn: sellA ? i.tokenA : i.tokenB,
    tokenOut: sellA ? i.tokenB : i.tokenA,
    amountIn,
    minAmountOut: (expectedOut * (BPS - i.slippageBps)) / BPS,
    recipient: i.recipient,
    origin: 'rebalancer',
  };
}
