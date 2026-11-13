import { describe, expect, it } from 'vitest';
import { quoteSample } from './rebalance.math';
import { planTick } from './rebalance.plan';
import { budgetOf, REBALANCE_SLIPPAGE_BPS, REBALANCE_THRESHOLD_BPS, toSnapshot, type VaultReads } from './rebalance.snapshot';

const USDC = (n: bigint) => n * 10n ** 6n;
const WAVAX = (n: bigint) => n * 10n ** 18n;

const SAFE = '0x1111111111111111111111111111111111111111';
const USDC_ADDR = '0x2222222222222222222222222222222222222222';
const WAVAX_ADDR = '0x3333333333333333333333333333333333333333';
const NOW = 1_762_600_000n;

/** Fuji demo pool price: 1 WAVAX = 25 USDC, so a 100 USDC sample quotes 4 WAVAX. */
const reads = (over: Partial<VaultReads> = {}): VaultReads => ({
  safe: SAFE,
  isDemo: false,
  isActive: true,
  expiry: NOW + 86_400n,
  now: NOW,
  limits: [
    { token: USDC_ADDR, maxPerTx: USDC(500n), dailyCap: USDC(1_500n) },
    { token: WAVAX_ADDR, maxPerTx: WAVAX(20n), dailyCap: WAVAX(60n) },
  ],
  spentToday: [{ token: USDC_ADDR, amount: USDC(200n) }],
  tokenA: USDC_ADDR,
  tokenB: WAVAX_ADDR,
  balanceA: USDC(10_000n),
  balanceB: WAVAX(100n), // 2,500 USDC worth: heavily overweight USDC
  sampleIn: quoteSample(6),
  quotedOut: WAVAX(4n),
  hasPendingSwap: false,
  ...over,
});

describe('budgetOf', () => {
  it('reads limits and spend per token, ignoring address case', () => {
    expect(budgetOf(USDC_ADDR.toUpperCase().replace('0X', '0x'), reads())).toEqual({
      maxPerTx: USDC(500n),
      dailyCap: USDC(1_500n),
      spentToday: USDC(200n),
    });
  });

  it('treats no spend entry as nothing spent today', () => {
    expect(budgetOf(WAVAX_ADDR, reads())?.spentToday).toBe(0n);
  });

  it('is null for a token the policy does not whitelist', () => {
    expect(budgetOf('0x4444444444444444444444444444444444444444', reads())).toBeNull();
  });
});

describe('toSnapshot', () => {
  it('maps chain reads with the rebalancer threshold and slippage', () => {
    const s = toSnapshot(reads());
    expect(s.pairWhitelisted).toBe(true);
    expect(s.math.thresholdBps).toBe(REBALANCE_THRESHOLD_BPS);
    expect(s.math.slippageBps).toBe(REBALANCE_SLIPPAGE_BPS);
    expect(s.math.budgetA.spentToday).toBe(USDC(200n));
    // 4 WAVAX per 100 USDC -> 0.04e12 WAVAX base units per USDC base unit, scaled 1e18.
    expect(s.math.priceAInB).toBe((WAVAX(4n) * 10n ** 18n) / USDC(100n));
  });

  it('flags a pair the policy does not cover', () => {
    const s = toSnapshot(reads({ limits: [{ token: USDC_ADDR, maxPerTx: USDC(500n), dailyCap: USDC(1_500n) }] }));
    expect(s.pairWhitelisted).toBe(false);
    expect(planTick([s], 100n)[0]).toEqual({ safe: SAFE, action: 'skip', reason: 'pair-not-whitelisted' });
  });

  it('a quote that rounds to zero skips instead of trading blind', () => {
    const s = toSnapshot(reads({ quotedOut: 0n }));
    expect(planTick([s], 100n)[0]).toEqual({ safe: SAFE, action: 'skip', reason: 'no-quote' });
  });
});

describe('toSnapshot + planTick across decimals (USDC 6, WAVAX 18)', () => {
  it('selling USDC is clamped to what is left of today (1,500 - 200 = 1,300) and maxPerTx 500', () => {
    const [d] = planTick([toSnapshot(reads())], 1_000n);
    expect(d).toMatchObject({ action: 'swap', intent: { tokenIn: USDC_ADDR, tokenOut: WAVAX_ADDR, amountIn: USDC(500n) } });
  });

  it('selling USDC never exceeds the remaining daily budget', () => {
    const [d] = planTick([toSnapshot(reads({ spentToday: [{ token: USDC_ADDR, amount: USDC(1_400n) }] }))], 1_000n);
    expect(d).toMatchObject({ action: 'swap', intent: { amountIn: USDC(100n) } });
  });

  it('selling WAVAX (18 decimals) is clamped by the WAVAX limits, not the USDC ones', () => {
    const [d] = planTick([toSnapshot(reads({ balanceA: USDC(100n), balanceB: WAVAX(400n) }))], 1_000n);
    expect(d).toMatchObject({ action: 'swap', intent: { tokenIn: WAVAX_ADDR, tokenOut: USDC_ADDR, amountIn: WAVAX(20n) } });
  });

  it('no budget left for the token to sell -> nothing to do', () => {
    const [d] = planTick([toSnapshot(reads({ spentToday: [{ token: USDC_ADDR, amount: USDC(1_500n) }] }))], 1_000n);
    expect(d).toEqual({ safe: SAFE, action: 'skip', reason: 'balanced' });
  });
});
