import { describe, expect, it } from 'vitest';
import {
  clampAmount,
  computeRebalance,
  priceFromQuote,
  quoteSample,
  remainingToday,
  type RebalanceInput,
  type TokenBudget,
} from './rebalance.math';

// A = USDC (6 decimals), B = WAVAX (18 decimals): the demo pair, deliberately different.
const USDC = (n: bigint) => n * 10n ** 6n;
const WAVAX = (n: bigint) => n * 10n ** 18n;
/** 1 WAVAX = 20 USDC, so 1 USDC (1e6 base units) quotes 0.05 WAVAX (5e16 base units). */
const PRICE = priceFromQuote(USDC(1n), 5n * 10n ** 16n)!;

const usdcBudget: TokenBudget = { maxPerTx: USDC(500n), dailyCap: USDC(1_500n), spentToday: 0n };
const wavaxBudget: TokenBudget = { maxPerTx: WAVAX(20n), dailyCap: WAVAX(60n), spentToday: 0n };

const base: RebalanceInput = {
  balanceA: USDC(1_000n),
  balanceB: WAVAX(50n), // worth 1,000 USDC: balanced
  priceAInB: PRICE,
  thresholdBps: 200n, // 2% of NAV
  budgetA: usdcBudget,
  budgetB: wavaxBudget,
  tokenA: '0x2222222222222222222222222222222222222222',
  tokenB: '0x3333333333333333333333333333333333333333',
  recipient: '0x1111111111111111111111111111111111111111',
  slippageBps: 100n,
};

describe('priceFromQuote (D8)', () => {
  it('turns a router quote into a 1e18-scaled price per base unit across decimals', () => {
    expect(PRICE).toBe(5n * 10n ** 28n);
    // The same price from a bigger sample (100 USDC -> 5 WAVAX).
    expect(priceFromQuote(quoteSample(6), WAVAX(5n))).toBe(PRICE);
  });

  it('refuses to price when the quote rounds to zero', () => {
    expect(priceFromQuote(USDC(1n), 0n)).toBeNull();
    expect(priceFromQuote(0n, WAVAX(1n))).toBeNull();
  });

  it('samples whole tokens in base units', () => {
    expect(quoteSample(6)).toBe(USDC(100n));
    expect(quoteSample(18, 1n)).toBe(WAVAX(1n));
  });
});

describe('clampAmount', () => {
  it('takes the smallest of wanted, maxPerTx and what is left today', () => {
    expect(clampAmount(USDC(200n), usdcBudget)).toBe(USDC(200n));
    expect(clampAmount(USDC(800n), usdcBudget)).toBe(USDC(500n));
    expect(clampAmount(USDC(400n), { ...usdcBudget, spentToday: USDC(1_300n) })).toBe(USDC(200n));
  });

  it('returns 0 when the budget is gone or the token is not whitelisted', () => {
    expect(clampAmount(USDC(10n), { ...usdcBudget, spentToday: USDC(1_500n) })).toBe(0n);
    expect(clampAmount(USDC(10n), { ...usdcBudget, spentToday: USDC(2_000n) })).toBe(0n);
    expect(clampAmount(USDC(10n), { maxPerTx: 0n, dailyCap: 0n, spentToday: 0n })).toBe(0n);
    expect(remainingToday({ ...usdcBudget, spentToday: USDC(2_000n) })).toBe(0n);
  });
});

describe('computeRebalance', () => {
  it('does nothing when balanced or within the 2% threshold', () => {
    expect(computeRebalance(base)).toBeNull();
    expect(computeRebalance({ ...base, balanceA: USDC(1_030n) })).toBeNull(); // ~1.5% off
  });

  it('sells USDC when overweight USDC, in USDC base units', () => {
    // 1,000 USDC + 10 WAVAX (= 200 USDC): move half the gap, 400 USDC -> 20 WAVAX.
    const r = computeRebalance({ ...base, balanceB: WAVAX(10n) });
    expect(r).toEqual({
      tokenIn: base.tokenA,
      tokenOut: base.tokenB,
      amountIn: USDC(400n),
      minAmountOut: (WAVAX(20n) * 99n) / 100n,
      recipient: base.recipient,
      origin: 'rebalancer',
    });
  });

  it('sells WAVAX when overweight WAVAX, clamped by the WAVAX cap, not the USDC one', () => {
    // 100 USDC + 50 WAVAX: wants 22.5 WAVAX, WAVAX maxPerTx is 20.
    const r = computeRebalance({ ...base, balanceA: USDC(100n) });
    expect(r?.tokenIn).toBe(base.tokenB);
    expect(r?.amountIn).toBe(WAVAX(20n));
    expect(r?.minAmountOut).toBe((USDC(400n) * 99n) / 100n);
  });

  it('clamps to maxPerTx', () => {
    const r = computeRebalance({ ...base, balanceB: 0n, balanceA: USDC(5_000n) });
    expect(r?.amountIn).toBe(USDC(500n));
  });

  it('clamps to what is left of today\'s budget (Q7 acceptance)', () => {
    const r = computeRebalance({ ...base, balanceB: WAVAX(10n), budgetA: { ...usdcBudget, spentToday: USDC(1_300n) } });
    expect(r?.amountIn).toBe(USDC(200n));
  });

  it('skips when today\'s budget is used up or the token sold is not whitelisted', () => {
    expect(computeRebalance({ ...base, balanceB: WAVAX(10n), budgetA: { ...usdcBudget, spentToday: USDC(1_500n) } })).toBeNull();
    expect(computeRebalance({ ...base, balanceB: WAVAX(10n), budgetA: { maxPerTx: 0n, dailyCap: 0n, spentToday: 0n } })).toBeNull();
  });

  it('skips dust that would need minOut = 0 (the module rejects it, C3)', () => {
    const dust = computeRebalance({ ...base, balanceA: 3n, balanceB: 0n, priceAInB: 10n ** 18n, thresholdBps: 0n });
    expect(dust).toBeNull();
  });

  it('skips when the price is unknown', () => {
    expect(computeRebalance({ ...base, balanceB: WAVAX(10n), priceAInB: 0n })).toBeNull();
  });

  it('never exceeds maxPerTx or the remaining budget, and always sets minOut > 0', () => {
    // Deterministic pseudo-random sweep over balances, prices and spend.
    let seed = 42n;
    const rand = (mod: bigint) => {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
      return seed % mod;
    };
    let swaps = 0;
    for (let k = 0; k < 2_000; k++) {
      const budgetA = { ...usdcBudget, spentToday: rand(USDC(1_800n)) };
      const budgetB = { ...wavaxBudget, spentToday: rand(WAVAX(70n)) };
      const input: RebalanceInput = {
        ...base,
        balanceA: rand(USDC(20_000n)),
        balanceB: rand(WAVAX(1_000n)),
        priceAInB: priceFromQuote(USDC(1n), 10n ** 15n + rand(10n ** 18n))!,
        budgetA,
        budgetB,
      };
      const r = computeRebalance(input);
      if (!r) continue;
      swaps++;
      const budget = r.tokenIn === base.tokenA ? budgetA : budgetB;
      expect(r.amountIn).toBeGreaterThan(0n);
      expect(r.amountIn).toBeLessThanOrEqual(budget.maxPerTx);
      expect(r.amountIn).toBeLessThanOrEqual(remainingToday(budget));
      expect(r.minAmountOut).toBeGreaterThan(0n);
      expect(r.tokenIn).not.toBe(r.tokenOut);
      expect(r.recipient).toBe(base.recipient);
    }
    expect(swaps).toBeGreaterThan(100); // the sweep really exercised the swap path
  });
});
