import type Redis from 'ioredis';
import type { Address, PublicClient } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../core/config/env.schema';
import type { SwapIntent } from '../../core/types';
import type { SwapQueueService } from '../auditor/swap-queue.service';
import type { VaultRegistryService } from '../vault/vault-registry.service';
import { quoteSample } from './domain/rebalance.math';
import { rebalanceJobId } from './domain/rebalance.plan';
import { toSnapshot, type VaultReads } from './domain/rebalance.snapshot';
import type { LoadedVault, RebalanceSnapshotService } from './rebalance-snapshot.service';
import { claimKey, RebalancerProcessor } from './rebalancer.processor';
import type { RouterQuoteService } from './router-quote.service';

const USDC = (n: bigint) => n * 10n ** 6n;
const WAVAX = (n: bigint) => n * 10n ** 18n;

const SAFE_1: Address = '0x1111111111111111111111111111111111111111';
const SAFE_2: Address = '0x5555555555555555555555555555555555555555';
const DEMO: Address = '0x6666666666666666666666666666666666666666';
const USDC_ADDR: Address = '0x2222222222222222222222222222222222222222';
const WAVAX_ADDR: Address = '0x3333333333333333333333333333333333333333';
const ROUTER: Address = '0x4444444444444444444444444444444444444444';
const BLOCK = 1_234n;
const NOW = 1_762_600_000n;

/** Overweight USDC: the planner sells 500 USDC (maxPerTx) for WAVAX at 1 WAVAX = 25 USDC. */
const reads = (safe: Address, over: Partial<VaultReads> = {}): VaultReads => ({
  safe,
  isDemo: false,
  isActive: true,
  expiry: NOW + 86_400n,
  now: NOW,
  limits: [
    { token: USDC_ADDR, maxPerTx: USDC(500n), dailyCap: USDC(1_500n) },
    { token: WAVAX_ADDR, maxPerTx: WAVAX(20n), dailyCap: WAVAX(60n) },
  ],
  spentToday: [],
  tokenA: USDC_ADDR,
  tokenB: WAVAX_ADDR,
  balanceA: USDC(10_000n),
  balanceB: WAVAX(100n),
  sampleIn: quoteSample(6),
  quotedOut: WAVAX(4n),
  hasPendingSwap: false,
  ...over,
});

const loaded = (r: VaultReads): LoadedVault => ({ snapshot: toSnapshot(r), router: ROUTER });

/** Redis SET NX EX / DEL, enough for the claim. */
function fakeRedis(taken: string[] = []) {
  const keys = new Set(taken);
  return {
    keys,
    set: vi.fn(async (key: string, _v: string, _ex: 'EX', _ttl: number, _nx: 'NX') => {
      if (keys.has(key)) return null;
      keys.add(key);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => (keys.delete(key) ? 1 : 0)),
  };
}

interface Setup {
  /** Registry rows (A8): lowercase, as the vaults table stores them. Default: SAFE_1. */
  registry?: { safe: Address; isDemo?: boolean }[];
  env?: Partial<Env>;
  vaults?: Record<string, LoadedVault | null | Error>;
  /** Quote of the exact swap amount; default 500 USDC -> 19.9 WAVAX (some price impact). */
  quote?: bigint | Error;
  enqueue?: (vault: Address, kind: string, intent: SwapIntent) => Promise<string>;
  redis?: ReturnType<typeof fakeRedis>;
}

function setup(s: Setup = {}) {
  const env = {
    TOKEN_A_ADDRESS: USDC_ADDR,
    TOKEN_B_ADDRESS: WAVAX_ADDR,
    ...s.env,
  } as Env;
  const registry = {
    list: vi.fn(async () => (s.registry ?? [{ safe: SAFE_1 }]).map((r) => ({ safe: r.safe.toLowerCase(), isDemo: r.isDemo ?? false }))),
  };
  const vaults = s.vaults ?? { [SAFE_1]: loaded(reads(SAFE_1)) };
  const snapshots = {
    read: vi.fn(async (safe: Address) => {
      const v = vaults[safe];
      if (v instanceof Error) throw v;
      return v ?? null;
    }),
  };
  const quotes = {
    amountOut: vi.fn(async () => {
      if (s.quote instanceof Error) throw s.quote;
      return s.quote ?? 199n * 10n ** 17n;
    }),
  };
  let n = 0;
  const swapQueue = { enqueue: vi.fn(s.enqueue ?? (async () => `job-${++n}`)) };
  const redis = s.redis ?? fakeRedis();
  const client = { getBlockNumber: vi.fn(async () => BLOCK) };
  const processor = new RebalancerProcessor(
    registry as unknown as VaultRegistryService,
    snapshots as unknown as RebalanceSnapshotService,
    quotes as unknown as RouterQuoteService,
    swapQueue as unknown as SwapQueueService,
    redis as unknown as Redis,
    client as unknown as PublicClient,
    env,
  );
  return { processor, snapshots, quotes, swapQueue, redis, client };
}

describe('RebalancerProcessor.tick', () => {
  it('does nothing, not even an RPC call, when the registry is empty', async () => {
    const t = setup({ registry: [] });
    expect(await t.processor.tick()).toEqual({ blockNumber: null, queued: [], skipped: [] });
    expect(t.client.getBlockNumber).not.toHaveBeenCalled();
  });

  it('stays idle without a token pair', async () => {
    const t = setup({ env: { TOKEN_B_ADDRESS: undefined } });
    expect((await t.processor.tick()).queued).toEqual([]);
    expect(t.snapshots.read).not.toHaveBeenCalled();
  });

  it('queues the planned swap for the Auditor, minOut from a quote of the exact amount minus 1%', async () => {
    const t = setup();
    const summary = await t.processor.tick();

    expect(summary).toEqual({ blockNumber: '1234', queued: ['job-1'], skipped: [] });
    expect(t.quotes.amountOut).toHaveBeenCalledWith(ROUTER, USDC_ADDR, WAVAX_ADDR, USDC(500n));
    expect(t.swapQueue.enqueue).toHaveBeenCalledWith(SAFE_1, 'rebalance', {
      tokenIn: USDC_ADDR,
      tokenOut: WAVAX_ADDR,
      amountIn: USDC(500n),
      minAmountOut: (199n * 10n ** 17n * 9_900n) / 10_000n,
      recipient: SAFE_1,
      origin: 'rebalancer',
    });
    expect(t.redis.keys.has(claimKey(rebalanceJobId(SAFE_1, BLOCK)))).toBe(true);
  });

  it('never exceeds maxPerTx or what is left of today', async () => {
    const t = setup({
      vaults: { [SAFE_1]: loaded(reads(SAFE_1, { spentToday: [{ token: USDC_ADDR, amount: USDC(1_350n) }] })) },
    });
    await t.processor.tick();
    expect(t.swapQueue.enqueue.mock.calls[0]?.[2].amountIn).toBe(USDC(150n));
  });

  it('a second tick in the same 10-block bucket cannot queue a duplicate', async () => {
    const redis = fakeRedis();
    const first = setup({ redis });
    const second = setup({ redis });
    await first.processor.tick();
    const summary = await second.processor.tick();
    expect(summary.queued).toEqual([]);
    expect(summary.skipped).toEqual([{ safe: SAFE_1, reason: 'duplicate' }]);
    expect(second.swapQueue.enqueue).not.toHaveBeenCalled();
  });

  it('skips the public demo vault without reading it, an unknown address and a vault with a pending swap', async () => {
    const t = setup({
      registry: [{ safe: DEMO, isDemo: true }, { safe: SAFE_2 }, { safe: SAFE_1 }],
      vaults: {
        [SAFE_2]: null,
        [SAFE_1]: loaded(reads(SAFE_1, { hasPendingSwap: true })),
      },
    });
    const summary = await t.processor.tick();
    expect(summary.queued).toEqual([]);
    expect(summary.skipped).toEqual([
      { safe: DEMO, reason: 'demo-vault' },
      { safe: SAFE_2, reason: 'not-a-vault' },
      { safe: SAFE_1, reason: 'pending-swap' },
    ]);
    expect(t.snapshots.read).not.toHaveBeenCalledWith(DEMO, expect.anything(), expect.anything());
    expect(t.quotes.amountOut).not.toHaveBeenCalled();
  });

  it('one vault failing to read does not stop the others', async () => {
    const t = setup({
      registry: [{ safe: SAFE_2 }, { safe: SAFE_1 }],
      vaults: { [SAFE_2]: new Error('rpc timeout'), [SAFE_1]: loaded(reads(SAFE_1)) },
    });
    const summary = await t.processor.tick();
    expect(summary.queued).toEqual(['job-1']);
    expect(summary.skipped).toEqual([{ safe: SAFE_2, reason: 'read-failed' }]);
  });

  it('does not queue when the exact amount quotes to nothing', async () => {
    const t = setup({ quote: 0n });
    const summary = await t.processor.tick();
    expect(summary.skipped).toEqual([{ safe: SAFE_1, reason: 'no-quote-for-amount' }]);
    expect(t.redis.set).not.toHaveBeenCalled();
  });

  it('releases the claim when queueing fails, so the next tick can retry', async () => {
    const t = setup({
      enqueue: async () => {
        throw new Error('db down');
      },
    });
    const summary = await t.processor.tick();
    expect(summary.skipped).toEqual([{ safe: SAFE_1, reason: 'enqueue-failed' }]);
    expect(t.redis.keys.size).toBe(0);
  });
});
