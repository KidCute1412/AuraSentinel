import { z } from 'zod';
import { Address } from '../chain';
import { Amount, fromAmount, toAmount } from '../money';

export const JobOrigin = z.enum(['rebalancer', 'manual', 'redteam']);
export type JobOrigin = z.infer<typeof JobOrigin>;

/** Wire form (JSON / BullMQ / DB): money as base-unit strings. */
export const SwapIntent = z.object({
  tokenIn: Address,
  tokenOut: Address,
  amountIn: Amount,
  minAmountOut: Amount,
  recipient: Address,
  origin: JobOrigin,
});
export type SwapIntent = z.infer<typeof SwapIntent>;

/** In-process form used by domain math. Convert at the boundary only. */
export type SwapIntentBigint = Omit<SwapIntent, 'amountIn' | 'minAmountOut'> & {
  amountIn: bigint;
  minAmountOut: bigint;
};

export const intentToBigint = (i: SwapIntent): SwapIntentBigint => ({
  ...i,
  amountIn: fromAmount(i.amountIn),
  minAmountOut: fromAmount(i.minAmountOut),
});

export const intentToWire = (i: SwapIntentBigint): SwapIntent => ({
  ...i,
  amountIn: toAmount(i.amountIn),
  minAmountOut: toAmount(i.minAmountOut),
});
