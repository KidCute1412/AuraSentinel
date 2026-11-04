/**
 * PLACEHOLDER contracts. The canonical versions are Zod schemas in packages/shared
 * (SwapIntent, SimResult, Explanation, JobDto). Replace these imports once that package exists.
 * All money is bigint in base units (invariant 4).
 */
import type { Address } from 'viem';

export interface SwapIntent {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minAmountOut: bigint;
  recipient: Address;
}

/** JSON-safe form for BullMQ payloads and the DB (bigint -> decimal string). */
export interface SwapIntentWire extends Omit<SwapIntent, 'amountIn' | 'minAmountOut'> {
  amountIn: string;
  minAmountOut: string;
}

export const intentToWire = (i: SwapIntent): SwapIntentWire => ({
  ...i,
  amountIn: i.amountIn.toString(),
  minAmountOut: i.minAmountOut.toString(),
});

export const intentFromWire = (w: SwapIntentWire): SwapIntent => ({
  ...w,
  amountIn: BigInt(w.amountIn),
  minAmountOut: BigInt(w.minAmountOut),
});

export interface SimResult {
  ok: boolean;
  amountOut: bigint;
  balancesBefore: Record<string, bigint>;
  balancesAfter: Record<string, bigint>;
  revertReason?: string;
}

export interface Explanation {
  messageVi: string;
  source: 'llm' | 'template';
}

export type JobStatus = 'queued' | 'prechecking' | 'simulating' | 'sending' | 'confirmed' | 'blocked' | 'failed';
