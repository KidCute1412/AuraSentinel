import { describe, expect, it } from 'vitest';
import { budgetLeft, displayUnits, evaluatePreflight, swapsLeft, type PreflightInput } from './preflight';

const NOW = new Date('2026-11-30T09:00:00Z');
const NOW_S = Math.floor(NOW.getTime() / 1000);
const USDC = (n: number) => BigInt(n) * 1_000_000n;
const AVAX = (milli: number) => BigInt(milli) * 10n ** 15n;

/** Everything ready for the stage. */
const ready = (): PreflightInput => ({
  now: NOW,
  services: { ok: true, value: { postgres: true, redis: true, rpc: true, worker: true, anvil: true } },
  gas: { ok: true, value: { balance: AVAX(50), maxFeePerGas: 160n } },
  minGasWei: AVAX(20),
  gasUsedPerSwap: 350_000n,
  demo: { ok: true, value: { isActive: true, expiry: NOW_S + 7 * 86_400, dailyCap: USDC(1_500), spentToday: USDC(200), usdcBalance: USDC(5_000) } },
  indexer: { ok: true, value: { cursor: 1_000n, head: 1_010n } },
  paused: { ok: true, value: true },
  geminiConfigured: true,
  blockedTxs: { ok: true, value: 2 },
  failedLastHour: { ok: true, value: 0 },
});

const byId = (i: PreflightInput, id: string) => evaluatePreflight(i).checks.find((c) => c.id === id)!;

describe('evaluatePreflight', () => {
  it('is ready when every check passes, with no fix lines', () => {
    const r = evaluatePreflight(ready());
    expect(r.status).toBe('ok');
    expect(r.checks.every((c) => c.status === 'ok' && c.fix === null)).toBe(true);
    expect(r.checkedAt).toBe(NOW.toISOString());
    expect(r.demoBudget).toEqual({ left: String(USDC(1_300)), cap: String(USDC(1_500)) });
  });

  it('takes the worst check as the overall status', () => {
    const warn = { ...ready(), paused: { ok: true, value: false } } as PreflightInput;
    expect(evaluatePreflight(warn).status).toBe('warn');
    const fail = { ...warn, services: { ok: true, value: { postgres: true, redis: true, rpc: true, worker: false, anvil: true } } } as PreflightInput;
    const r = evaluatePreflight(fail);
    expect(r.status).toBe('fail');
    expect(byId(fail, 'services').detail).toBe('Down: worker.');
  });

  it('grades agent gas by the minimum and by swaps left at the current fee', () => {
    expect(byId(ready(), 'agent-gas')).toMatchObject({ status: 'ok' });
    expect(byId(ready(), 'agent-gas').detail).toContain('swaps at the current fee');
    // Above the minimum, but at 2 gwei a 350k-gas swap costs 0.0007 AVAX: 0.021 AVAX pays for 30 swaps.
    const fewSwaps = { ...ready(), gas: { ok: true, value: { balance: AVAX(21), maxFeePerGas: 2_000_000_000n } } } as PreflightInput;
    expect(byId(fewSwaps, 'agent-gas').status).toBe('warn');
    const empty = { ...ready(), gas: { ok: true, value: { balance: AVAX(5), maxFeePerGas: 160n } } } as PreflightInput;
    expect(byId(empty, 'agent-gas')).toMatchObject({ status: 'fail' });
    expect(byId(empty, 'agent-gas').fix).toContain('faucet');
  });

  it('fails a killed or expired demo vault, warns when it expires within a day', () => {
    const killed = ready();
    (killed.demo as { value: { isActive: boolean } }).value.isActive = false;
    expect(byId(killed, 'demo-active').status).toBe('fail');

    const soon = ready();
    (soon.demo as { value: { expiry: number } }).value.expiry = NOW_S + 3 * 3600;
    expect(byId(soon, 'demo-expiry')).toMatchObject({ status: 'warn', detail: 'Expires in 3 h.' });

    const gone = ready();
    (gone.demo as { value: { expiry: number } }).value.expiry = NOW_S - 1;
    expect(byId(gone, 'demo-expiry').status).toBe('fail');

    const never = ready();
    (never.demo as { value: { expiry: number } }).value.expiry = 0;
    expect(byId(never, 'demo-expiry').status).toBe('ok');
  });

  it('warns when less than the 200 USDC normal trade is left today, fails when the vault holds less than that', () => {
    const spent = ready();
    (spent.demo as { value: { spentToday: bigint } }).value.spentToday = USDC(1_400);
    expect(byId(spent, 'demo-budget')).toMatchObject({ status: 'warn' });
    expect(byId(spent, 'demo-budget').detail).toContain('100 USDC of 1,500 USDC left today');

    const poor = ready();
    (poor.demo as { value: { usdcBalance: bigint } }).value.usdcBalance = USDC(150);
    expect(byId(poor, 'demo-balance').status).toBe('fail');
  });

  it('fails when no demo vault is configured', () => {
    expect(byId({ ...ready(), demo: null }, 'demo-vault').status).toBe('fail');
  });

  it('warns on indexer lag, a running rebalancer, no Gemini key, no on-chain proof, and recent failures', () => {
    expect(byId({ ...ready(), indexer: { ok: true, value: { cursor: 100n, head: 1_000n } } }, 'indexer').status).toBe('warn');
    expect(byId({ ...ready(), indexer: { ok: true, value: { cursor: null, head: 1_000n } } }, 'indexer').status).toBe('warn');
    expect(byId({ ...ready(), paused: { ok: true, value: false } }, 'demo-mode').status).toBe('warn');
    expect(byId({ ...ready(), geminiConfigured: false }, 'explainer').status).toBe('warn');
    expect(byId({ ...ready(), blockedTxs: { ok: true, value: 0 } }, 'onchain-proof').status).toBe('warn');
    expect(byId({ ...ready(), failedLastHour: { ok: true, value: 3 } }, 'recent-failures')).toMatchObject({ status: 'warn' });
  });

  it('fails only the check whose source could not be read', () => {
    const r = evaluatePreflight({ ...ready(), indexer: { ok: false, error: 'connection refused' } });
    const indexer = r.checks.find((c) => c.id === 'indexer')!;
    expect(indexer).toMatchObject({ status: 'fail', detail: 'Could not read: connection refused' });
    expect(r.checks.filter((c) => c.status !== 'ok')).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('counts swaps left with bigint math and refuses an unknown fee', () => {
    expect(swapsLeft(AVAX(50), 160n, 350_000n)).toBe(892_857_142);
    expect(swapsLeft(AVAX(50), null, 350_000n)).toBeNull();
    expect(swapsLeft(AVAX(50), 0n, 350_000n)).toBeNull();
  });

  it('never reports a negative budget', () => {
    expect(budgetLeft({ isActive: true, expiry: 0, dailyCap: USDC(100), spentToday: USDC(150), usdcBalance: 0n })).toBe(0n);
    expect(budgetLeft({ isActive: true, expiry: 0, dailyCap: null, spentToday: 0n, usdcBalance: 0n })).toBeNull();
  });

  it('formats units en-US', () => {
    expect(displayUnits(USDC(1_500) + 500_000n, 6, 2)).toBe('1,500.5');
    expect(displayUnits(123_456_789_000_000_000n, 18, 4)).toBe('0.1234');
    expect(displayUnits(0n, 18, 4)).toBe('0');
  });
});
