import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../core/config/env.schema';
import { AdminService, median } from './admin.service';

const SAFE = '0x1111111111111111111111111111111111111111';
const USDC = '0x2222222222222222222222222222222222222222';
const AGENT = '0x3333333333333333333333333333333333333333';
const MODULE = '0x4444444444444444444444444444444444444444';

const queue = (over: Record<string, unknown> = {}) => ({
  isPaused: vi.fn().mockResolvedValue(true),
  pause: vi.fn(),
  resume: vi.fn(),
  add: vi.fn().mockResolvedValue({ id: 'manual-1' }),
  getJobs: vi.fn().mockResolvedValue([]),
  getJobCounts: vi.fn().mockResolvedValue({ waiting: 1, paused: 2, prioritized: 0, active: 1, delayed: 0, failed: 3 }),
  ...over,
});

function service(over: { vault?: unknown; indexer?: unknown; rebalance?: unknown } = {}) {
  const rebalance = queue(over.rebalance as Record<string, unknown>);
  const env = {
    SAFE_ADDRESS: SAFE,
    ANVIL_RPC_URL: 'http://anvil.test:8545',
    POLICY_MODULE_ADDRESS: MODULE,
    TOKEN_A_ADDRESS: USDC,
    AGENT_MIN_GAS_WEI: 20_000_000_000_000_000n,
    REBALANCE_INTERVAL_MS: 15_000,
    REBALANCE_MAX_VAULTS: 1,
    GEMINI_API_KEY: undefined,
  } as unknown as Env;
  const svc = new AdminService(
    rebalance as never,
    queue() as never,
    queue() as never,
    { check: vi.fn().mockResolvedValue({ postgres: 'up', redis: 'up', rpc: 'up', worker: 'up' }) } as never,
    {
      countsSince: vi.fn().mockResolvedValue({ total: 5, attacks: 2, byStatus: { confirmed: 2, rejected: 1, reverted: 1, failed: 1 } }),
      txTimings: vi.fn().mockResolvedValue([
        { sentAt: new Date(0), minedAt: new Date(1_000) },
        { sentAt: new Date(0), minedAt: new Date(3_000) },
      ]),
      listByVault: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    } as never,
    { get: vi.fn().mockResolvedValue({ blockedTxs: [{}] }) } as never,
    {
      list: vi.fn().mockResolvedValue([
        { safe: SAFE, owner: AGENT, module: MODULE, createdAtBlock: 10n, isDemo: true },
        { safe: USDC, owner: AGENT, module: MODULE, createdAtBlock: 11n, isDemo: false },
        { safe: AGENT, owner: AGENT, module: MODULE, createdAtBlock: 12n, isDemo: false },
      ]),
    } as never,
    (over.vault ?? {
      getState: vi.fn().mockResolvedValue({
        isActive: true,
        policy: { expiry: 0, limits: [{ token: USDC, maxPerTx: '500000000', dailyCap: '1500000000' }] },
        spentToday: [{ token: USDC, dayId: 1, amount: '200000000' }],
        balances: [{ token: USDC, symbol: 'USDC', decimals: 6, amount: '5000000000' }],
      }),
    }) as never,
    (over.indexer ?? { getCursor: vi.fn().mockResolvedValue(995n) }) as never,
    {
      readContract: vi.fn().mockResolvedValue([AGENT]),
      getBalance: vi.fn().mockResolvedValue(50_000_000_000_000_000n),
      estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 160n }),
      getBlockNumber: vi.fn().mockResolvedValue(1_000n),
    } as never,
    env,
  );
  return { svc, rebalance };
}

/** The Anvil fork answering eth_blockNumber (or not). */
const anvil = vi.fn<typeof fetch>();
beforeEach(() => {
  anvil.mockResolvedValue(new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x10' }), { status: 200 }));
  vi.stubGlobal('fetch', anvil);
});
afterEach(() => vi.unstubAllGlobals());

describe('AdminService', () => {
  it('builds the preflight from every source; here only the missing Gemini key and a failed job warn', async () => {
    const { svc } = service();
    const r = await svc.preflight(new Date('2026-11-30T09:00:00Z'));
    expect(r.checks.filter((c) => c.status !== 'ok').map((c) => c.id)).toEqual(['explainer', 'recent-failures']);
    expect(r.status).toBe('warn');
    expect(r.demoBudget).toEqual({ left: '1300000000', cap: '1500000000' });
  });

  it('fails the services check when the simulation fork is down', async () => {
    anvil.mockRejectedValue(new TypeError('fetch failed'));
    const { svc } = service();
    const services = (await svc.preflight()).checks.find((c) => c.id === 'services')!;
    expect(services.status).toBe('fail');
    expect(services.detail).toContain('anvil');
    expect(String(anvil.mock.calls[0]![0])).toBe('http://anvil.test:8545');
  });

  it('keeps the other checks when one source throws', async () => {
    const { svc } = service({ vault: { getState: vi.fn().mockRejectedValue(new Error('rpc timeout\nstack...')) } });
    const r = await svc.preflight();
    expect(r.checks.find((c) => c.id === 'demo-vault')).toMatchObject({ status: 'fail', detail: 'Could not read: rpc timeout' });
    expect(r.checks.find((c) => c.id === 'services')?.status).toBe('ok');
    expect(r.status).toBe('fail');
  });

  it('reports queues (paused jobs count as waiting), last 24 h, and rebalancer slots in registry order', async () => {
    const { svc } = service();
    const o = await svc.overview();
    expect(o.queues.map((q) => q.name)).toEqual(['swap', 'attack', 'rebalance']);
    expect(o.queues[0]).toEqual({ name: 'swap', waiting: 3, active: 1, delayed: 0, failed: 3 });
    expect(o.last24h).toEqual({ total: 5, confirmed: 2, rejected: 1, reverted: 1, failed: 1, attacks: 2, medianMinedMs: 2_000 });
    expect(o.vaults.map((v) => v.rebalanceSlot)).toEqual([null, 1, null]); // demo, slot 1 of 1, over the cap
  });

  it('reads the last tick from the rebalance queue and estimates swaps left', async () => {
    const tick = { finishedOn: Date.parse('2026-11-30T09:00:00Z'), returnvalue: { blockNumber: '99', queued: ['a'], skipped: [{ safe: SAFE, reason: 'balanced' }] } };
    const { svc } = service({ rebalance: { getJobs: vi.fn().mockResolvedValue([tick]) } });
    const s = await svc.rebalancer();
    expect(s.lastTick).toEqual({ at: '2026-11-30T09:00:00.000Z', blockNumber: '99', queued: 1, skipped: [{ safe: SAFE, reason: 'balanced' }] });
    expect(s.lastTickAt).toBe('2026-11-30T09:00:00.000Z');
    expect(s.agent).toMatchObject({ lowGas: false, swapsLeft: 892_857_142 });
  });

  it('maps the blocked filter to both shields', async () => {
    const { svc } = service();
    await svc.jobsList('blocked', 20);
    const jobs = (svc as unknown as { jobs: { listByVault: ReturnType<typeof vi.fn> } }).jobs;
    expect(jobs.listByVault).toHaveBeenCalledWith({ limit: 20, cursor: undefined, status: ['rejected', 'reverted'] });
  });
});

describe('median', () => {
  it('handles odd, even and empty samples', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeNull();
  });
});
