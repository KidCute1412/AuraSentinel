import { describe, expect, it } from 'vitest';
import type { SwapIntent } from '../../../core/types';
import { precheck, type PrecheckSnapshot } from './precheck';

// Demo numbers (glossary): USDC 6 decimals, maxPerTx 500, dailyCap 1,500. WAVAX 18 decimals.
const USDC = (n: bigint) => n * 10n ** 6n;
const WAVAX = (n: bigint) => n * 10n ** 18n;

const SAFE = '0x1111111111111111111111111111111111111111';
const AGENT = '0x2222222222222222222222222222222222222222';
const T_USDC = '0x3333333333333333333333333333333333333333';
const T_WAVAX = '0x4444444444444444444444444444444444444444';
const T_OTHER = '0x5555555555555555555555555555555555555555';
const HACKER = '0x9999999999999999999999999999999999999999';
const NOW = 1_762_600_000n;

const snapshot: PrecheckSnapshot = {
  safe: SAFE,
  signer: AGENT,
  now: NOW,
  policy: { agentSigner: AGENT, isActive: true, expiry: NOW + 86_400n },
  limits: [
    { token: T_USDC, maxPerTx: USDC(500n), dailyCap: USDC(1_500n) },
    { token: T_WAVAX, maxPerTx: WAVAX(20n), dailyCap: WAVAX(60n) },
  ],
  spentToday: [],
};

const intent: SwapIntent = {
  tokenIn: T_USDC,
  tokenOut: T_WAVAX,
  amountIn: USDC(200n),
  minAmountOut: WAVAX(9n),
  recipient: SAFE,
  origin: 'rebalancer',
};

type Case = [name: string, i: Partial<SwapIntent>, s: Partial<PrecheckSnapshot>, reasons: string[]];

describe('precheck: one row per gate, with ±1 boundaries', () => {
  const cases: Case[] = [
    ['compliant 200 USDC rebalance', {}, {}, []],

    // Gate 1
    ['signer is not the agent', {}, { signer: HACKER }, ['UnauthorizedAgent']],
    ['signer differs only in case', {}, { signer: AGENT.toUpperCase().replace('0X', '0x') }, []],
    ['policy revoked (Kill-Switch)', {}, { policy: { ...snapshot.policy, isActive: false } }, ['PolicyInactive']],
    ['now == expiry is still valid', {}, { now: snapshot.policy.expiry }, []],
    ['now == expiry + 1 is expired', {}, { now: snapshot.policy.expiry + 1n }, ['PolicyExpired']],

    // Gate 2
    ['tokenIn not whitelisted', { tokenIn: T_OTHER }, {}, ['TokenNotWhitelisted']],
    ['tokenOut not whitelisted', { tokenOut: T_OTHER }, {}, ['TokenNotWhitelisted']],
    [
      'listed token with dailyCap 0 is not whitelisted',
      {},
      { limits: [snapshot.limits[0]!, { token: T_WAVAX, maxPerTx: 0n, dailyCap: 0n }] },
      ['TokenNotWhitelisted'],
    ],
    ['tokenIn == tokenOut', { tokenOut: T_USDC }, {}, ['SameToken']],

    // Gate 3
    ['amountIn == maxPerTx passes', { amountIn: USDC(500n) }, {}, []],
    ['amountIn == maxPerTx + 1 fails', { amountIn: USDC(500n) + 1n }, {}, ['ExceedsPerTxCap']],

    // Gate 4
    [
      'spent + amountIn == dailyCap passes',
      { amountIn: USDC(200n) },
      { spentToday: [{ token: T_USDC, amount: USDC(1_300n) }] },
      [],
    ],
    [
      'spent + amountIn == dailyCap + 1 fails',
      { amountIn: USDC(200n) + 1n },
      { spentToday: [{ token: T_USDC, amount: USDC(1_300n) }] },
      ['ExceedsDailyCap'],
    ],

    // C3
    ['minAmountOut == 0', { minAmountOut: 0n }, {}, ['ZeroMinOut']],
    ['minAmountOut == 1 passes', { minAmountOut: 1n }, {}, []],

    // Intent check (attack #2)
    ['recipient is not the Safe', { recipient: HACKER }, {}, ['RECIPIENT_NOT_SAFE']],
    ['recipient differs only in case', { recipient: SAFE.toUpperCase().replace('0X', '0x') }, {}, []],
  ];

  it.each(cases)('%s', (_name, i, s, reasons) => {
    const r = precheck({ ...intent, ...i }, { ...snapshot, ...s });
    expect(r.reasons).toEqual(reasons);
    expect(r.ok).toBe(reasons.length === 0);
  });
});

describe('precheck: reason order follows the contract', () => {
  it('attack #1 (2,000 USDC) reports ExceedsPerTxCap before ExceedsDailyCap', () => {
    const r = precheck({ ...intent, amountIn: USDC(2_000n) }, snapshot);
    expect(r.reasons).toEqual(['ExceedsPerTxCap', 'ExceedsDailyCap']);
  });

  it('gate 1 comes before amounts, intent checks come last', () => {
    const r = precheck(
      { ...intent, amountIn: USDC(2_000n), recipient: HACKER },
      { ...snapshot, policy: { ...snapshot.policy, isActive: false } },
    );
    expect(r.reasons).toEqual(['PolicyInactive', 'ExceedsPerTxCap', 'ExceedsDailyCap', 'RECIPIENT_NOT_SAFE']);
  });

  it('reports every failure in contract order', () => {
    const r = precheck(
      { ...intent, tokenOut: T_USDC, amountIn: USDC(2_000n), minAmountOut: 0n, recipient: HACKER },
      { ...snapshot, signer: HACKER, now: snapshot.policy.expiry + 1n, policy: { ...snapshot.policy, isActive: false } },
    );
    expect(r.reasons).toEqual([
      'UnauthorizedAgent',
      'PolicyInactive',
      'PolicyExpired',
      'SameToken',
      'ExceedsPerTxCap',
      'ExceedsDailyCap',
      'ZeroMinOut',
      'RECIPIENT_NOT_SAFE',
    ]);
  });

  it('skips cap checks for a token that is not whitelisted', () => {
    const r = precheck({ ...intent, tokenIn: T_OTHER, amountIn: USDC(1_000_000n) }, snapshot);
    expect(r.reasons).toEqual(['TokenNotWhitelisted']);
  });
});

describe('precheck: caps are per token (C1, D4)', () => {
  const sellWavax: Partial<SwapIntent> = { tokenIn: T_WAVAX, tokenOut: T_USDC, minAmountOut: USDC(1n) };

  it('uses the WAVAX cap for a WAVAX sale, not the USDC one', () => {
    expect(precheck({ ...intent, ...sellWavax, amountIn: WAVAX(20n) }, snapshot).ok).toBe(true);
    expect(precheck({ ...intent, ...sellWavax, amountIn: WAVAX(20n) + 1n }, snapshot).reasons).toEqual([
      'ExceedsPerTxCap',
    ]);
  });

  it('spending the whole USDC budget does not block a WAVAX sale', () => {
    const s = { ...snapshot, spentToday: [{ token: T_USDC, amount: USDC(1_500n) }] };
    expect(precheck({ ...intent, ...sellWavax, amountIn: WAVAX(10n) }, s).ok).toBe(true);
    expect(precheck(intent, s).reasons).toEqual(['ExceedsDailyCap']);
  });

  it('matches token addresses case-insensitively', () => {
    const s = { ...snapshot, spentToday: [{ token: T_USDC.toUpperCase().replace('0X', '0x'), amount: USDC(1_400n) }] };
    expect(precheck(intent, s).reasons).toEqual(['ExceedsDailyCap']);
  });
});
