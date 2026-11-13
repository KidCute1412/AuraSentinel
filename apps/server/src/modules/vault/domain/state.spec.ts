import { StateDto } from '@agentshield/shared';
import { describe, expect, it } from 'vitest';
import { dayIdOf, stateBudgetBps, toStateDto, type VaultReads } from './state';

const USDC = '0x3333333333333333333333333333333333333333';
const WAVAX = '0x4444444444444444444444444444444444444444';
const u = (n: bigint) => n * 10n ** 6n;
const w = (n: bigint) => n * 10n ** 18n;

const reads = (over: Partial<VaultReads> = {}): VaultReads => ({
  safe: '0x1111111111111111111111111111111111111111',
  blockNumber: 49_234_500n,
  now: 1_762_992_000n + 3_600n, // 13/11/2026 01:00 UTC
  epoch: 3n,
  policy: { agentSigner: '0x5555555555555555555555555555555555555555', expiry: 1_795_000_000n, isActive: true },
  limits: [
    { token: USDC, maxPerTx: u(500n), dailyCap: u(1_500n) },
    { token: WAVAX, maxPerTx: w(20n), dailyCap: w(60n) },
  ],
  spentToday: [
    { token: USDC, amount: u(200n) },
    { token: WAVAX, amount: w(30n) },
  ],
  balances: [
    { token: USDC, symbol: 'USDC', decimals: 6, amount: u(2_800n) },
    { token: WAVAX, symbol: 'WAVAX', decimals: 18, amount: w(109n) / 10n },
  ],
  budgetToken: USDC,
  ...over,
});

describe('toStateDto', () => {
  it('matches the shared StateDto with money as base-unit strings', () => {
    const dto = toStateDto(reads());
    expect(StateDto.parse(dto)).toEqual(dto);
    expect(dto).toMatchObject({
      blockNumber: '49234500',
      policyEpoch: 3,
      isActive: true,
      budgetUsedPct: 13.3,
      stale: false,
      policy: { expiry: 1_795_000_000, limits: [{ token: USDC, maxPerTx: '500000000', dailyCap: '1500000000' }, expect.anything()] },
      balances: [{ symbol: 'USDC', amount: '2800000000' }, { symbol: 'WAVAX', amount: '10900000000000000000' }],
    });
    expect(dto.spentToday[0]).toEqual({ token: USDC, dayId: 20405, amount: '200000000' });
  });

  it('flags a fallback snapshot as stale', () => {
    expect(toStateDto(reads(), true).stale).toBe(true);
  });
});

describe('stateBudgetBps', () => {
  it('uses the budget token (USDC) when whitelisted', () => {
    expect(stateBudgetBps(reads())).toBe(1333n);
  });

  it('falls back to the most used token, never under-reporting', () => {
    expect(stateBudgetBps(reads({ budgetToken: undefined }))).toBe(5000n);
  });

  it('is 0 with no limits', () => {
    expect(stateBudgetBps(reads({ limits: [], budgetToken: undefined }))).toBe(0n);
  });
});

describe('dayIdOf', () => {
  it('is block.timestamp / 1 days', () => {
    expect(dayIdOf(86_399n)).toBe(0);
    expect(dayIdOf(86_400n)).toBe(1);
  });
});
