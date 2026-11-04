import { describe, expect, it } from 'vitest';
import { computeRebalance, type RebalanceInput } from './rebalance.math';

const base: RebalanceInput = {
  balanceA: 100n * 10n ** 6n,
  balanceB: 100n * 10n ** 6n,
  priceAInB: 10n ** 18n,
  thresholdBps: 500n,
  maxPerTx: 1_000n * 10n ** 6n,
  tokenA: '0x2222222222222222222222222222222222222222',
  tokenB: '0x3333333333333333333333333333333333333333',
  recipient: '0x1111111111111111111111111111111111111111',
  slippageBps: 100n,
};

describe('computeRebalance', () => {
  it('returns null when balanced', () => {
    expect(computeRebalance(base)).toBeNull();
  });
  it('sells A when overweight A', () => {
    const r = computeRebalance({ ...base, balanceA: 300n * 10n ** 6n });
    expect(r?.tokenIn).toBe(base.tokenA);
    expect(r?.amountIn).toBe(100n * 10n ** 6n);
  });
  it('clamps to maxPerTx', () => {
    const r = computeRebalance({ ...base, balanceA: 300n * 10n ** 6n, maxPerTx: 10n * 10n ** 6n });
    expect(r?.amountIn).toBe(10n * 10n ** 6n);
  });
});
