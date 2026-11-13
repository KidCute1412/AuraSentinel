import type { SwapIntent } from '../../../core/types';
import { priceFromQuote, type TokenBudget } from './rebalance.math';
import type { VaultSnapshot } from './rebalance.plan';

type Addr = SwapIntent['tokenIn'];

/** Rebalance only when the Safe drifts more than 2% of NAV from 50/50 (system-design §4.2). */
export const REBALANCE_THRESHOLD_BPS = 200n;

/** Slippage tolerance of a rebalancer swap: 1%, same as a manual rebalance. */
export const REBALANCE_SLIPPAGE_BPS = 100n;

/** Raw reads for one vault, all from the chain (P1). The processor fills it; nothing here does I/O. */
export interface VaultReads {
  safe: Addr;
  isDemo: boolean;
  isActive: boolean;
  /** Unix seconds. */
  expiry: bigint;
  /** Block timestamp the reads were pinned to, unix seconds. */
  now: bigint;
  limits: readonly { token: string; maxPerTx: bigint; dailyCap: bigint }[];
  spentToday: readonly { token: string; amount: bigint }[];
  tokenA: Addr;
  tokenB: Addr;
  /** Safe balances in base units. */
  balanceA: bigint;
  balanceB: bigint;
  /** router.getAmountsOut(sampleIn, [tokenA, tokenB]) on the router the module swaps through (D8). */
  sampleIn: bigint;
  quotedOut: bigint;
  hasPendingSwap: boolean;
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Limits and today's spend of one token, or null when the policy does not whitelist it (C1: caps are per token). */
export function budgetOf(token: string, reads: Pick<VaultReads, 'limits' | 'spentToday'>): TokenBudget | null {
  const limit = reads.limits.find((l) => sameAddress(l.token, token));
  if (!limit) return null;
  const spent = reads.spentToday.find((s) => sameAddress(s.token, token))?.amount ?? 0n;
  return { maxPerTx: limit.maxPerTx, dailyCap: limit.dailyCap, spentToday: spent };
}

const NO_BUDGET: TokenBudget = { maxPerTx: 0n, dailyCap: 0n, spentToday: 0n };

/** Chain reads -> the snapshot planTick decides on. Pure, so the mapping is tested without Nest or an RPC. */
export function toSnapshot(r: VaultReads): VaultSnapshot {
  const budgetA = budgetOf(r.tokenA, r);
  const budgetB = budgetOf(r.tokenB, r);
  return {
    safe: r.safe,
    isDemo: r.isDemo,
    isActive: r.isActive,
    expiry: r.expiry,
    now: r.now,
    hasPendingSwap: r.hasPendingSwap,
    pairWhitelisted: budgetA !== null && budgetB !== null,
    math: {
      balanceA: r.balanceA,
      balanceB: r.balanceB,
      // 0 when the quote rounds to nothing: planTick skips with 'no-quote'.
      priceAInB: priceFromQuote(r.sampleIn, r.quotedOut) ?? 0n,
      thresholdBps: REBALANCE_THRESHOLD_BPS,
      budgetA: budgetA ?? NO_BUDGET,
      budgetB: budgetB ?? NO_BUDGET,
      tokenA: r.tokenA,
      tokenB: r.tokenB,
      slippageBps: REBALANCE_SLIPPAGE_BPS,
    },
  };
}
