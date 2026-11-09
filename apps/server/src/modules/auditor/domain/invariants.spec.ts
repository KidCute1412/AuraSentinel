import { describe, expect, it } from 'vitest';
import { checkInvariants, type SimOutcome } from './invariants';

const AMOUNT_IN = 200n * 10n ** 6n; // 200 USDC
const good: SimOutcome = {
  deltaSafeTokenOut: 9n * 10n ** 18n,
  deltaSafeTokenIn: -AMOUNT_IN,
  deltaAttacker: 0n,
  allowanceAfter: 0n,
};

describe('checkInvariants', () => {
  const cases: [name: string, sim: Partial<SimOutcome>, reasons: string[]][] = [
    ['money only changed form', {}, []],
    ['Safe received nothing', { deltaSafeTokenOut: 0n }, ['INVARIANT_NO_OUTPUT']],
    ['Safe lost tokenOut', { deltaSafeTokenOut: -1n }, ['INVARIANT_NO_OUTPUT']],
    ['Safe received 1 base unit', { deltaSafeTokenOut: 1n }, []],
    ['Safe paid 1 unit more than amountIn', { deltaSafeTokenIn: -AMOUNT_IN - 1n }, ['INVARIANT_INPUT_MISMATCH']],
    ['Safe paid 1 unit less than amountIn', { deltaSafeTokenIn: -AMOUNT_IN + 1n }, ['INVARIANT_INPUT_MISMATCH']],
    ['attacker gained 1 unit', { deltaAttacker: 1n }, ['INVARIANT_ATTACKER_GAINED']],
    ['allowance left behind', { allowanceAfter: 1n }, ['INVARIANT_ALLOWANCE_LEFT']],
    [
      'everything broken, reported in order',
      { deltaSafeTokenOut: 0n, deltaSafeTokenIn: -AMOUNT_IN * 2n, deltaAttacker: AMOUNT_IN, allowanceAfter: 2n ** 256n - 1n },
      ['INVARIANT_NO_OUTPUT', 'INVARIANT_INPUT_MISMATCH', 'INVARIANT_ATTACKER_GAINED', 'INVARIANT_ALLOWANCE_LEFT'],
    ],
  ];

  it.each(cases)('%s', (_name, sim, reasons) => {
    const r = checkInvariants({ amountIn: AMOUNT_IN }, { ...good, ...sim });
    expect(r.reasons).toEqual(reasons);
    expect(r.ok).toBe(reasons.length === 0);
  });
});
