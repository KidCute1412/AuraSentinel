import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../core/config/env.schema';
import type { EventBus } from '../../core/redis/event-bus';
import type { SimulatorPort } from '../simulation/simulator.port';
import type { VaultRegistryService } from '../vault/vault-registry.service';
import type { IndexerRepository } from './indexer.repository';
import { IndexerService } from './indexer.service';

const FACTORY = '0xfaC0000000000000000000000000000000000001';
const SAFE = '0x1111111111111111111111111111111111111111';
const MODULE = '0x2222222222222222222222222222222222222222';
const OWNER = '0x5555555555555555555555555555555555555555';
const USDC = '0x3333333333333333333333333333333333333333';
const WAVAX = '0x4444444444444444444444444444444444444444';
const tx = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as const;

const deployed = { eventName: 'ModuleDeployed', address: FACTORY, blockNumber: 10n, logIndex: 0, transactionHash: tx(1), args: { safe: SAFE, module: MODULE, owner: OWNER } };
const swap = {
  eventName: 'GuardedSwap',
  address: MODULE.toLowerCase(),
  blockNumber: 12n,
  logIndex: 3,
  transactionHash: tx(2),
  args: { tokenIn: USDC, tokenOut: WAVAX, amountIn: 200n, amountOut: 8n, dayId: 1n, spentToday: 200n },
};
const revoked = { eventName: 'PolicyRevoked', address: MODULE.toLowerCase(), blockNumber: 12n, logIndex: 1, transactionHash: tx(3), args: { by: OWNER, at: 1n } };

function setup(head = 20n) {
  const events = new Set<string>();
  const vaults: { safe: string; module: string }[] = [];
  let cursor: bigint | undefined;
  const repo = {
    getCursor: vi.fn(async () => cursor),
    setCursor: vi.fn(async (_id: string, b: bigint) => void (cursor = b)),
    insertEvent: vi.fn(async (e: { txHash: string; logIndex: number }) => {
      const key = `${e.txHash}:${e.logIndex}`;
      if (events.has(key)) return false;
      events.add(key);
      return true;
    }),
  };
  const registry = {
    register: vi.fn(async (v: { safe: string; module: string }) => {
      if (vaults.some((x) => x.safe === v.safe)) return false;
      vaults.push(v);
      return true;
    }),
    list: vi.fn(async () => vaults.map((v) => ({ ...v, isDemo: false }))),
  };
  const client = {
    getBlockNumber: vi.fn(async () => head),
    getLogs: vi.fn(async (q: { address: unknown; fromBlock: bigint; toBlock: bigint }) => {
      const all = q.address === FACTORY ? [deployed] : [swap, revoked];
      return all.filter((l) => l.blockNumber >= q.fromBlock && l.blockNumber <= q.toBlock);
    }),
  };
  const bus = { publish: vi.fn(async () => undefined) };
  const simulator = { simulate: vi.fn(), invalidate: vi.fn() };
  const env = { FACTORY_ADDRESS: FACTORY, INDEXER_START_BLOCK: 5n, INDEXER_POLL_MS: 1_000, INDEXER_MAX_SPAN: 2_000n } as unknown as Env;
  const svc = new IndexerService(
    repo as unknown as IndexerRepository,
    registry as unknown as VaultRegistryService,
    bus as unknown as EventBus,
    client as never,
    simulator as unknown as SimulatorPort,
    env,
  );
  const published = () => bus.publish.mock.calls.map((c) => (c as unknown as [{ type: string }])[0].type);
  return { svc, repo, registry, client, bus, simulator, published, resetCursor: (b?: bigint) => (cursor = b) };
}

describe('IndexerService.pollOnce', () => {
  it('registers a new vault, then publishes its module events in block/log order', async () => {
    const t = setup();
    expect(await t.svc.pollOnce()).toBe(false);
    expect(t.registry.register).toHaveBeenCalledWith({ safe: SAFE, module: MODULE, owner: OWNER, createdAtBlock: 10n });
    // revoked (logIndex 1) before swap (logIndex 3) in the same block
    expect(t.published()).toEqual(['vault.registered', 'chain.revoked', 'chain.swap']);
    expect(t.bus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'chain.swap', vault: SAFE, amountIn: '200' }));
    expect(t.simulator.invalidate).toHaveBeenCalled();
    expect(t.repo.setCursor).toHaveBeenLastCalledWith('indexer', 20n);
  });

  it('re-reading the same range (crash before the cursor moved) publishes nothing twice', async () => {
    const t = setup();
    await t.svc.pollOnce();
    t.resetCursor(undefined);
    t.bus.publish.mockClear();
    await t.svc.pollOnce();
    expect(t.bus.publish).not.toHaveBeenCalled();
  });

  it('does nothing when caught up', async () => {
    const t = setup();
    await t.svc.pollOnce();
    t.client.getLogs.mockClear();
    expect(await t.svc.pollOnce()).toBe(false);
    expect(t.client.getLogs).not.toHaveBeenCalled();
  });

  it('catches up a long backlog range by range in one tick', async () => {
    const t = setup(5_000n);
    await t.svc.tick();
    expect(t.repo.setCursor.mock.calls.map((c) => c[1])).toEqual([2_004n, 4_004n, 5_000n]);
  });

  it('a failed poll leaves the cursor where it was', async () => {
    const t = setup();
    t.client.getLogs.mockRejectedValueOnce(new Error('rpc down'));
    await t.svc.tick();
    expect(t.repo.setCursor).not.toHaveBeenCalled();
  });
});
