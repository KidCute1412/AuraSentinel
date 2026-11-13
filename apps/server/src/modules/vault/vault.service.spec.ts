import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../core/config/env.schema';
import type { PolicyService, VaultChainState } from '../policy/policy.service';
import type { VaultRegistryService } from './vault-registry.service';
import { ChainUnavailableError, VaultNotFoundError, VaultService } from './vault.service';

const SAFE = '0x1111111111111111111111111111111111111111';
const MODULE = '0x2222222222222222222222222222222222222222';
const USDC = '0x3333333333333333333333333333333333333333';

const chainState = (spent: bigint): VaultChainState => ({
  blockNumber: 10n,
  now: 86_400n * 20_405n,
  policy: { agentSigner: SAFE, router: SAFE, expiry: 2_000_000_000n, isActive: true },
  epoch: 1n,
  limits: [{ token: USDC, maxPerTx: 500_000_000n, dailyCap: 1_500_000_000n }],
  spentToday: [{ token: USDC, amount: spent }],
});

function setup(read: () => Promise<VaultChainState>, found = true) {
  const client = { multicall: vi.fn(async () => [2_800_000_000n]) };
  const registry = { resolve: vi.fn(async () => (found ? { safe: SAFE, module: MODULE, isDemo: true } : null)) };
  const policy = {
    readVaultState: vi.fn(read),
    tokenMeta: vi.fn(async () => ({ symbol: 'USDC', decimals: 6 })),
  };
  const svc = new VaultService(
    client as never,
    { TOKEN_A_ADDRESS: USDC } as unknown as Env,
    registry as unknown as VaultRegistryService,
    policy as unknown as PolicyService,
  );
  return { svc, policy };
}

describe('VaultService.getState', () => {
  it('reads the chain and serves repeat calls from the 1 s cache', async () => {
    const { svc, policy } = setup(async () => chainState(200_000_000n));
    const a = await svc.getState(SAFE);
    const b = await svc.getState(SAFE);
    expect(a).toMatchObject({ stale: false, budgetUsedPct: 13.3, balances: [{ amount: '2800000000' }] });
    expect(b).toBe(a);
    expect(policy.readVaultState).toHaveBeenCalledTimes(1);
  });

  it('falls back to the last snapshot, flagged stale, when the RPC fails', async () => {
    let fail = false;
    const { svc } = setup(async () => {
      if (fail) throw new Error('fetch failed');
      return chainState(0n);
    });
    svc.freshMs = 0;
    await svc.getState(SAFE);
    fail = true;
    await expect(svc.getState(SAFE)).resolves.toMatchObject({ stale: true });
  });

  it('answers stale quickly when the RPC hangs, and refreshes the cache when it lands', async () => {
    let slow: ((s: VaultChainState) => void) | undefined;
    let calls = 0;
    const { svc } = setup(() => (++calls === 1 ? Promise.resolve(chainState(0n)) : new Promise((r) => (slow = r))));
    svc.freshMs = 0;
    svc.staleAfterMs = 20;
    await svc.getState(SAFE);
    await expect(svc.getState(SAFE)).resolves.toMatchObject({ stale: true, budgetUsedPct: 0 });

    slow!(chainState(300_000_000n));
    await vi.waitFor(async () => {
      svc.freshMs = 60_000; // read from cache only
      expect(await svc.getState(SAFE)).toMatchObject({ stale: false, budgetUsedPct: 20 });
    });
  });

  it('503 when the RPC fails and there is no snapshot yet', async () => {
    const { svc } = setup(() => Promise.reject(new Error('fetch failed')));
    await expect(svc.getState(SAFE)).rejects.toBeInstanceOf(ChainUnavailableError);
  });

  it('404 for an address with no AgentPolicyModule', async () => {
    const { svc } = setup(async () => chainState(0n), false);
    await expect(svc.getState(SAFE)).rejects.toBeInstanceOf(VaultNotFoundError);
  });
});
