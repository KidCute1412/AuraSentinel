import { describe, expect, it } from 'vitest';
import type { SwapIntent } from '../../../core/types';
import { failedReasons, invariantChecks, netFlow, onchainChecks, precheckChecks, simulationChecks } from './checks';
import { checkInvariants } from './invariants';
import { precheck, type PrecheckSnapshot } from './precheck';
import { tokenInfoFor } from './tokens';

const SAFE = '0x1111111111111111111111111111111111111111';
const AGENT = '0x2222222222222222222222222222222222222222';
const USDC = '0x3333333333333333333333333333333333333333';
const WAVAX = '0x4444444444444444444444444444444444444444';
const STRANGER = '0x5555555555555555555555555555555555555555';
const info = tokenInfoFor({ tokenA: USDC, tokenB: WAVAX });
const U = (n: number) => BigInt(n) * 1_000_000n;

const snap = (over: Partial<PrecheckSnapshot> = {}): PrecheckSnapshot => ({
  safe: SAFE,
  signer: AGENT,
  now: 1_000n,
  policy: { agentSigner: AGENT, isActive: true, expiry: 2_000n },
  limits: [
    { token: USDC, maxPerTx: U(500), dailyCap: U(1_500) },
    { token: WAVAX, maxPerTx: 10n ** 19n, dailyCap: 10n ** 20n },
  ],
  spentToday: [{ token: USDC, amount: U(200) }],
  ...over,
});
const intent = (over: Partial<SwapIntent> = {}): SwapIntent =>
  ({ tokenIn: USDC, tokenOut: WAVAX, amountIn: U(200), minAmountOut: 1n, recipient: SAFE, ...over }) as SwapIntent;

describe('precheckChecks', () => {
  it('lists every rule in the contract gate order, all passing for a normal trade', () => {
    const rows = precheckChecks(intent(), snap(), info);
    expect(rows.map((r) => r.id)).toEqual(['agent-signer', 'kill-switch', 'policy-expiry', 'tokens-allowed', 'different-tokens', 'per-trade-cap', 'daily-cap', 'min-out', 'recipient']);
    expect(rows.every((r) => r.pass && r.reasonCode === null)).toBe(true);
  });

  it('shows what the trade had against the limit, in base units with the token', () => {
    const rows = precheckChecks(intent({ amountIn: U(2_000) }), snap(), info);
    const cap = rows.find((r) => r.id === 'per-trade-cap')!;
    expect(cap).toEqual({
      id: 'per-trade-cap',
      pass: false,
      reasonCode: 'ExceedsPerTxCap',
      actual: { type: 'amount', amount: '2000000000', token: USDC, symbol: 'USDC', decimals: 6 },
      limit: { type: 'amount', amount: '500000000', token: USDC, symbol: 'USDC', decimals: 6 },
    });
    // Daily: spent today (200) + this trade (2,000) against the 1,500 cap.
    expect(rows.find((r) => r.id === 'daily-cap')).toMatchObject({ pass: false, actual: { amount: '2200000000' }, limit: { amount: '1500000000' } });
  });

  it('flags the stranger recipient (attack #2) with both addresses', () => {
    const r = precheckChecks(intent({ recipient: STRANGER }), snap(), info).find((x) => x.id === 'recipient')!;
    expect(r).toMatchObject({ pass: false, reasonCode: 'RECIPIENT_NOT_SAFE', actual: { value: STRANGER }, limit: { value: SAFE } });
  });

  it('leaves the caps out when a token is not whitelisted (they would mean nothing)', () => {
    const ids = precheckChecks(intent({ tokenOut: STRANGER as SwapIntent['tokenOut'] }), snap(), info).map((r) => r.id);
    expect(ids).not.toContain('per-trade-cap');
    expect(ids).not.toContain('daily-cap');
  });

  it('is the source of the verdict: precheck reasons are exactly the failed rows, in order', () => {
    const cases: [Partial<SwapIntent>, Partial<PrecheckSnapshot>][] = [
      [{}, {}],
      [{ amountIn: U(2_000), recipient: STRANGER }, {}],
      [{}, { policy: { agentSigner: STRANGER, isActive: false, expiry: 10n } }],
      [{ minAmountOut: 0n }, { spentToday: [{ token: USDC, amount: U(1_400) }] }],
    ];
    for (const [i, s] of cases) {
      expect(precheck(intent(i), snap(s)).reasons).toEqual(failedReasons(precheckChecks(intent(i), snap(s), info)));
    }
  });
});

describe('simulation, invariant and on-chain rows', () => {
  const outcome = { deltaSafeTokenIn: -U(200), deltaSafeTokenOut: 9n * 10n ** 18n, deltaAttacker: 0n, allowanceAfter: 0n };

  it('records what moved in the simulation, or why it reverted', () => {
    expect(simulationChecks(intent(), { ok: true, outcome }, info).map((r) => [r.id, r.actual && 'amount' in r.actual ? r.actual.amount : null])).toEqual([
      ['sim-executes', null],
      ['sim-token-in', '-200000000'],
      ['sim-token-out', '9000000000000000000'],
    ]);
    expect(simulationChecks(intent(), { ok: false, revertReason: 'ExceedsDailyCap' }, info)).toEqual([
      { id: 'sim-executes', pass: false, reasonCode: 'ExceedsDailyCap', actual: { type: 'text', value: 'ExceedsDailyCap' }, limit: null },
    ]);
  });

  it('derives the invariant verdict from its rows, one row per invariant', () => {
    const bad = { ...outcome, deltaAttacker: 5n, allowanceAfter: 1n };
    const rows = invariantChecks(intent(), bad, info);
    expect(rows.map((r) => [r.id, r.pass])).toEqual([
      ['inv-output', true],
      ['inv-input', true],
      ['inv-attacker', false],
      ['inv-allowance', false],
    ]);
    expect(checkInvariants(intent(), bad).reasons).toEqual(failedReasons(rows));
  });

  it('records the transaction and what the chain answered', () => {
    const rows = onchainChecks({ txHash: '0xabc', blockNumber: 42n, status: 'reverted', revertReason: 'GS104' });
    expect(rows.at(-1)).toEqual({ id: 'tx-result', pass: false, reasonCode: 'GS104', actual: { type: 'text', value: 'GS104' }, limit: null });
    expect(onchainChecks({ txHash: '0xabc', blockNumber: 42n, status: 'success' }).every((r) => r.pass)).toBe(true);
  });

  it('nets the Safe flows of one token from receipt transfers', () => {
    const transfers = [
      { token: USDC, from: SAFE, to: STRANGER, value: U(200) },
      { token: WAVAX, from: STRANGER, to: SAFE.toUpperCase().replace('0X', '0x'), value: 5n },
      { token: USDC, from: STRANGER, to: AGENT, value: U(7) },
    ];
    expect(netFlow(transfers, SAFE, USDC)).toBe(-U(200));
    expect(netFlow(transfers, SAFE, WAVAX)).toBe(5n);
    expect(netFlow([], SAFE, USDC)).toBe(0n);
  });

  it('records what a mined swap measurably moved, and nothing for a revert', () => {
    const tx = { txHash: '0xabc', blockNumber: 42n, status: 'success' as const };
    const rows = onchainChecks(tx, [{ token: USDC, delta: -U(200), balanceAfter: U(800) }, { token: WAVAX, delta: 5n, balanceAfter: null }], info);
    expect(rows.slice(3).map((r) => [r.id, r.actual?.type === 'amount' ? r.actual.amount : null])).toEqual([
      ['chain-paid', '-200000000'],
      ['chain-balance', '800000000'],
      ['chain-received', '5'],
    ]);
    expect(rows.every((r) => r.pass)).toBe(true);
    expect(onchainChecks({ ...tx, status: 'reverted', revertReason: 'X' }, [{ token: USDC, delta: 0n, balanceAfter: 1n }])).toHaveLength(3);
  });
});
