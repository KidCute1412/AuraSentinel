import { encodeErrorResult } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POLICY_MODULE_ABI } from '../../../core/chain/abis';
import type { SwapIntent } from '../../../core/types';
import { AnvilSimulator } from './anvil.simulator';

const SAFE = '0x1111111111111111111111111111111111111111';
const AGENT = '0x2222222222222222222222222222222222222222';
const USDC = '0x3333333333333333333333333333333333333333';
const WAVAX = '0x4444444444444444444444444444444444444444';
const MODULE = '0x5555555555555555555555555555555555555555';
const ROUTER = '0x6666666666666666666666666666666666666666';
const target = { safe: SAFE, module: MODULE } as const;
const intent: SwapIntent = { tokenIn: USDC, tokenOut: WAVAX, amountIn: 100n, minAmountOut: 7n, recipient: SAFE, origin: 'rebalancer' };

/** Fake Anvil: records the RPC sequence; the "swap" moves -100 USDC / +7 WAVAX on the Safe. */
/** `routerRevertData`: what the router answers when the simulator asks it directly (undefined = it accepts). */
function fakeAnvil(opts: { revertData?: `0x${string}`; routerRevertData?: `0x${string}`; routerDown?: boolean } = {}) {
  const calls: string[] = [];
  let swapped = false;
  let snap = 0;
  const client = {
    reset: vi.fn(async () => void calls.push('reset')),
    snapshot: vi.fn(async () => {
      calls.push('snapshot');
      return `0x${(++snap).toString(16)}`;
    }),
    revert: vi.fn(async () => {
      calls.push('revert');
      swapped = false;
    }),
    readContract: vi.fn(async ({ functionName, address }: { functionName: string; address: string }) => {
      if (functionName === 'policy') return [AGENT, ROUTER, 0n, true];
      if (functionName === 'allowance') return 0n;
      if (address === USDC) return swapped ? 900n : 1000n;
      return swapped ? 7n : 0n;
    }),
    getBlock: vi.fn(async () => ({ timestamp: 1_000n })),
    impersonateAccount: vi.fn(async () => undefined),
    stopImpersonatingAccount: vi.fn(async () => undefined),
    setBalance: vi.fn(async () => undefined),
    call: vi.fn(async ({ to }: { to: string }) => {
      if (to === ROUTER) {
        if (opts.routerDown) throw new Error('fetch failed');
        if (opts.routerRevertData) throw Object.assign(new Error('reverted'), { cause: { data: opts.routerRevertData } });
        return { data: '0x' };
      }
      if (opts.revertData) throw Object.assign(new Error('reverted'), { cause: { data: opts.revertData } });
      return { data: '0x' };
    }),
    sendTransaction: vi.fn(async () => {
      calls.push('send');
      swapped = true;
      return '0xabc';
    }),
    waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })),
  };
  return { client, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('AnvilSimulator', () => {
  afterEach(() => vi.useRealTimers());

  it('returns the economic deltas of a successful swap and rolls the fork back', async () => {
    const { client, calls } = fakeAnvil();
    const sim = new AnvilSimulator(client as never, { refreshIntervalMs: 0 });
    const r = await sim.simulate(intent, target);
    expect(r).toEqual({ ok: true, deltaSafeTokenIn: '-100', deltaSafeTokenOut: '7', attackerBalance: '0', allowanceAfter: '0' });
    expect(calls).toEqual(['reset', 'snapshot', 'send', 'revert', 'snapshot']);
    expect(client.impersonateAccount).toHaveBeenCalledWith({ address: AGENT });
    expect(client.stopImpersonatingAccount).toHaveBeenCalled();
  });

  it('decodes a revert from eth_call and never mines it', async () => {
    const { client, calls } = fakeAnvil({ revertData: encodeErrorResult({ abi: POLICY_MODULE_ABI, errorName: 'ExceedsPerTxCap' }) });
    const sim = new AnvilSimulator(client as never, { refreshIntervalMs: 0 });
    const r = await sim.simulate({ ...intent, amountIn: 2_000n }, target);
    expect(r).toMatchObject({ ok: false, revertReason: 'ExceedsPerTxCap' });
    expect(calls).not.toContain('send');
  });

  describe('SwapFailed: the router is asked for the real reason (L6)', () => {
    const swapFailed = encodeErrorResult({ abi: POLICY_MODULE_ABI, errorName: 'SwapFailed' });
    // Real revert data from the Trader Joe router on Fuji (eth_call, 2026-11-17).
    const slippage = '0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000254a6f65526f757465723a20494e53554646494349454e545f4f55545055545f414d4f554e54000000000000000000000000000000000000000000000000000000';
    const transferFrom = '0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000245472616e7366657248656c7065723a205452414e534645525f46524f4d5f4641494c454400000000000000000000000000000000000000000000000000000000';

    it('price moved: reports ROUTER_INSUFFICIENT_OUTPUT, asking as the Safe with the same deadline', async () => {
      const { client, calls } = fakeAnvil({ revertData: swapFailed, routerRevertData: slippage });
      const sim = new AnvilSimulator(client as never, { refreshIntervalMs: 0 });
      const r = await sim.simulate(intent, target);
      expect(r).toMatchObject({ ok: false, revertReason: 'ROUTER_INSUFFICIENT_OUTPUT' });
      expect(calls).not.toContain('send');
      const probe = client.call.mock.calls.find(([a]) => (a as { to: string }).to === ROUTER)![0] as { account: string; data: string };
      expect(probe.account).toBe(SAFE);
      // swapExactTokensForTokens(100, 7, [USDC, WAVAX], SAFE, deadline = block 1_000 + 300)
      expect(probe.data.startsWith('0x38ed1739')).toBe(true);
      expect(probe.data).toContain((1_300).toString(16).padStart(64, '0'));
    });

    it('the router would accept, or only fails on transferFrom: keeps SwapFailed', async () => {
      for (const routerRevertData of [undefined, transferFrom]) {
        const { client } = fakeAnvil({ revertData: swapFailed, routerRevertData });
        const sim = new AnvilSimulator(client as never, { refreshIntervalMs: 0 });
        expect(await sim.simulate(intent, target)).toMatchObject({ ok: false, revertReason: 'SwapFailed' });
      }
    });

    it('the probe itself fails (RPC): keeps SwapFailed, never throws', async () => {
      const { client } = fakeAnvil({ revertData: swapFailed, routerDown: true });
      const sim = new AnvilSimulator(client as never, { refreshIntervalMs: 0 });
      expect(await sim.simulate(intent, target)).toMatchObject({ ok: false, revertReason: 'SwapFailed' });
    });

    it('other module reverts never probe the router', async () => {
      const { client } = fakeAnvil({ revertData: encodeErrorResult({ abi: POLICY_MODULE_ABI, errorName: 'ExceedsPerTxCap' }), routerRevertData: slippage });
      const sim = new AnvilSimulator(client as never, { refreshIntervalMs: 0 });
      expect(await sim.simulate(intent, target)).toMatchObject({ revertReason: 'ExceedsPerTxCap' });
      expect(client.call.mock.calls.some(([a]) => (a as { to: string }).to === ROUTER)).toBe(false);
    });
  });

  it('reuses a fresh base snapshot instead of resetting on every sim', async () => {
    const { client } = fakeAnvil();
    const sim = new AnvilSimulator(client as never, { refreshIntervalMs: 0 });
    await sim.simulate(intent, target);
    await sim.simulate(intent, target);
    await sim.simulate(intent, target);
    expect(client.reset).toHaveBeenCalledTimes(1);
    expect(client.revert).toHaveBeenCalledTimes(3);
  });

  it('resets synchronously when the base is older than maxForkAgeMs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { client } = fakeAnvil();
    const sim = new AnvilSimulator(client as never, { refreshIntervalMs: 0, maxForkAgeMs: 30_000 });
    await sim.simulate(intent, target);
    vi.setSystemTime(Date.now() + 31_000);
    await sim.simulate(intent, target);
    expect(client.reset).toHaveBeenCalledTimes(2);
  });

  it('invalidate() refreshes in the background and replays the last sim to warm the cache', async () => {
    const { client, calls } = fakeAnvil();
    const sim = new AnvilSimulator(client as never, { refreshIntervalMs: 0 });
    await sim.simulate(intent, target);
    calls.length = 0;
    sim.invalidate();
    sim.invalidate(); // coalesced
    await sim.simulate(intent, target); // queued behind the refresh on the mutex
    expect(calls).toEqual(['reset', 'snapshot', 'send', 'revert', 'snapshot', 'send', 'revert', 'snapshot']);
  });

  it('kicks off a warm-up refresh at boot so the first sim does not pay for the reset', async () => {
    const { client } = fakeAnvil();
    const sim = new AnvilSimulator(client as never, { refreshIntervalMs: 60_000 });
    await flush();
    await sim.simulate(intent, target);
    expect(client.reset).toHaveBeenCalledTimes(1);
    sim.onModuleDestroy();
  });

  it('on a plain (non-fork) node: snapshot per sim, never reset', async () => {
    const { client, calls } = fakeAnvil();
    const sim = new AnvilSimulator(client as never, { resetFork: false });
    await sim.simulate(intent, target);
    expect(calls).toEqual(['snapshot', 'send', 'revert']);
  });

  it('reports a non-Safe recipient gain as attackerBalance', async () => {
    const { client } = fakeAnvil();
    const ATTACKER = '0x9999999999999999999999999999999999999999';
    let sent = false;
    client.sendTransaction.mockImplementation(async () => {
      sent = true;
      return '0xabc';
    });
    client.readContract.mockImplementation(async ({ functionName, address, args }: { functionName: string; address: string; args?: string[] }) => {
      if (functionName === 'policy') return [AGENT, ROUTER, 0n, true];
      if (functionName === 'allowance') return 0n;
      if (args?.[0] === ATTACKER) return sent && address === WAVAX ? 7n : 0n;
      return 0n;
    });
    const sim = new AnvilSimulator(client as never, { refreshIntervalMs: 0 });
    const r = await sim.simulate({ ...intent, recipient: ATTACKER }, target);
    expect(r.attackerBalance).toBe('7');
  });

  it('rejects an unconfigured vault', async () => {
    const { client } = fakeAnvil();
    const sim = new AnvilSimulator(client as never, { refreshIntervalMs: 0 });
    await expect(sim.simulate(intent, { safe: SAFE, module: '0x0000000000000000000000000000000000000000' })).rejects.toThrow(
      'not configured',
    );
  });
});
