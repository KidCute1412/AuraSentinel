import { describe, expect, it } from 'vitest';
import { manualAmount, minOutFromQuote } from './manual-rebalance';

const USDC = (n: bigint) => n * 10n ** 6n;
const budget = { maxPerTx: USDC(500n), dailyCap: USDC(1_500n), spentToday: 0n };

describe('manualAmount', () => {
  it('keeps a request inside every limit', () => {
    expect(manualAmount(USDC(200n), budget)).toBe(USDC(200n));
  });

  it('clamps to maxPerTx', () => {
    expect(manualAmount(USDC(2_000n), budget)).toBe(USDC(500n));
  });

  it('clamps to what is left of the daily cap', () => {
    expect(manualAmount(USDC(500n), { ...budget, spentToday: USDC(1_300n) })).toBe(USDC(200n));
  });

  it('passes the request through when the day is used up, so the Auditor rejects it with a reason', () => {
    expect(manualAmount(USDC(200n), { ...budget, spentToday: USDC(1_500n) })).toBe(USDC(200n));
  });
});

describe('minOutFromQuote', () => {
  it('takes 1% off the quote by default, rounding down', () => {
    expect(minOutFromQuote(8_000_000_000_000_000_000n)).toBe(7_920_000_000_000_000_000n);
    expect(minOutFromQuote(199n)).toBe(197n);
  });

  it('keeps a zero quote at zero (precheck rejects ZeroMinOut)', () => {
    expect(minOutFromQuote(0n)).toBe(0n);
  });

  it('rejects an impossible slippage', () => {
    expect(() => minOutFromQuote(100n, 10_000n)).toThrow(RangeError);
  });
});
