import { describe, expect, it } from 'vitest';
import type { InvariantResult } from './invariants';
import type { PrecheckResult } from './precheck';
import { bpsToPct, budgetUsedBps, decideVerdict, formatPctVi, type BudgetInput } from './verdict';

const pass: PrecheckResult = { ok: true, reasons: [] };
const fine: InvariantResult = { ok: true, reasons: [] };

describe('decideVerdict', () => {
  it('is safe only when precheck, simulation and invariants all pass', () => {
    expect(decideVerdict({ precheck: pass, sim: { reverted: false, invariants: fine } })).toEqual({
      verdict: 'safe',
      reasonCode: null,
      stage: null,
    });
  });

  it('blocks at precheck with the first reason, even if a sim result is given', () => {
    const v = decideVerdict({
      precheck: { ok: false, reasons: ['ExceedsPerTxCap', 'ExceedsDailyCap'] },
      sim: { reverted: false, invariants: fine },
    });
    expect(v).toEqual({ verdict: 'blocked', reasonCode: 'ExceedsPerTxCap', stage: 'precheck' });
  });

  it('fails closed when the simulation did not run', () => {
    expect(decideVerdict({ precheck: pass })).toEqual({
      verdict: 'blocked',
      reasonCode: 'UNKNOWN_REVERT',
      stage: 'simulation',
    });
  });

  it('uses the decoded revert from the simulation', () => {
    const v = decideVerdict({ precheck: pass, sim: { reverted: true, revertReason: 'ExceedsDailyCap' } });
    expect(v).toEqual({ verdict: 'blocked', reasonCode: 'ExceedsDailyCap', stage: 'simulation' });
  });

  it('maps an unknown revert string to UNKNOWN_REVERT', () => {
    for (const revertReason of ['execution reverted', '0xdeadbeef', null, undefined]) {
      const v = decideVerdict({ precheck: pass, sim: { reverted: true, revertReason } });
      expect(v).toEqual({ verdict: 'blocked', reasonCode: 'UNKNOWN_REVERT', stage: 'simulation' });
    }
  });

  it('blocks on a broken invariant even though the sim did not revert', () => {
    const v = decideVerdict({
      precheck: pass,
      sim: { reverted: false, invariants: { ok: false, reasons: ['INVARIANT_ATTACKER_GAINED'] } },
    });
    expect(v).toEqual({ verdict: 'blocked', reasonCode: 'INVARIANT_ATTACKER_GAINED', stage: 'invariant' });
  });
});

describe('budgetUsedBps', () => {
  const USDC = (n: bigint) => n * 10n ** 6n;
  const base: BudgetInput = { verdict: 'safe', spentToday: 0n, amountIn: USDC(200n), dailyCap: USDC(1_500n) };

  it('200 / 1,500 = 13,3% (plan Q3 acceptance)', () => {
    const bps = budgetUsedBps(base);
    expect(bps).toBe(1_333n);
    expect(formatPctVi(bps)).toBe('13,3%');
    expect(bpsToPct(bps)).toBe(13.3);
  });

  const cases: [name: string, input: Partial<BudgetInput>, bps: bigint, vi: string][] = [
    ['half the budget', { amountIn: USDC(750n) }, 5_000n, '50%'],
    ['exactly the whole budget', { spentToday: USDC(1_300n) }, 10_000n, '100%'],
    ['blocked swap does not count its amount', { verdict: 'blocked', amountIn: USDC(2_000n) }, 0n, '0%'],
    [
      'blocked swap still shows what was spent',
      { verdict: 'blocked', spentToday: USDC(200n), amountIn: USDC(2_000n) },
      1_333n,
      '13,3%',
    ],
    ['clamped at 100%', { spentToday: USDC(1_500n), amountIn: USDC(100n) }, 10_000n, '100%'],
    ['token with no cap counts as fully used', { dailyCap: 0n }, 10_000n, '100%'],
    ['rounds down: 1 base unit of 1,500 USDC', { amountIn: 1n }, 0n, '0%'],
  ];

  it.each(cases)('%s', (_name, input, bps, vi) => {
    const got = budgetUsedBps({ ...base, ...input });
    expect(got).toBe(bps);
    expect(formatPctVi(got)).toBe(vi);
  });

  it('works with 18-decimal amounts beyond 2^53', () => {
    const WAVAX = (n: bigint) => n * 10n ** 18n;
    expect(budgetUsedBps({ verdict: 'safe', spentToday: WAVAX(10n), amountIn: WAVAX(5n), dailyCap: WAVAX(60n) })).toBe(
      2_500n,
    );
  });
});
