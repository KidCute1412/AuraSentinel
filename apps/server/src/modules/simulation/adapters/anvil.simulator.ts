import { toAmount, toSignedAmount, type ReasonCode } from '@agentshield/shared';
import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  createTestClient,
  http,
  isAddressEqual,
  parseEther,
  publicActions,
  walletActions,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { avalancheFuji } from 'viem/chains';
import { ERC20_ABI, POLICY_MODULE_ABI, SWAP_GAS } from '../../../core/chain/abis';
import { encodeGuardedSwap, swapDeadline } from '../../../core/chain/swap-calldata';
import { decodeRevert, probeRouterFailure } from '../../../core/chain/revert-decoder';
import { Mutex } from '../../../core/mutex';
import type { SimResult, SwapIntent } from '../../../core/types';
import type { SimTarget, SimulatorPort } from '../simulator.port';

/**
 * Anvil test client with public + wallet actions (impersonated sends, no key). No transport retries: Anvil is local,
 * and a retried `anvil_reset` would queue more resets behind a stuck one (Anvil retries the upstream itself).
 */
export function createAnvilClient(rpcUrl: string) {
  return createTestClient({ chain: avalancheFuji, mode: 'anvil', transport: http(rpcUrl, { timeout: 15_000, retryCount: 0 }) })
    .extend(publicActions)
    .extend(walletActions);
}
export type AnvilClient = ReturnType<typeof createAnvilClient>;

export interface AnvilSimulatorOptions {
  /**
   * The node is a fork of Fuji: refresh it with `anvil_reset` to the latest block. Off for a plain
   * (non-fork) Anvil in tests, where a reset would wipe the deployed contracts.
   */
  resetFork?: boolean;
  /** A base older than this is refreshed before the sim, on the critical path. */
  maxForkAgeMs?: number;
  /** Idle refresh period: reset + warm-up in the background so sims find a fresh, warm fork. 0 = off. */
  refreshIntervalMs?: number;
  /** AVAX given to the impersonated agent so a low-gas agent does not fail the sim. */
  agentGasBalance?: bigint;
  /**
   * Fuji RPCs the fork may follow, tried in turn when a reset fails or hangs (starting with the last one that
   * worked). Empty = keep the fork URL Anvil was started with.
   */
  forkUrls?: readonly string[];
  /** Longest a single `anvil_reset` may take before the next fork RPC is tried. */
  resetTimeoutMs?: number;
}

/** Rejects after `ms`: a reset that hangs on a slow upstream must not hold the fork (and every queued sim). */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

/** Host only, for logs (RPC URLs may carry an API key in the path or query). */
const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return 'fork rpc';
  }
};

interface Balances {
  safeIn: bigint;
  safeOut: bigint;
  watched: bigint[];
}

/**
 * Shield 1, step (b) (A5). On the Anvil fork of Fuji: read policy -> impersonate the agent ->
 * eth_call the real executeGuardedSwap calldata (revert -> decoded reason) -> mine it -> read
 * balances/allowance -> roll the fork back. The agent key is never needed: impersonation signs
 * nothing (P5).
 *
 * Freshness (system-design §3.5, plan B). Measured on the public Fuji RPC: `anvil_reset` takes
 * ~1.5 s and every cold storage slot afterwards ~0.2 s, so resetting per job cannot meet < 1 s.
 * Instead each sim runs on a base snapshot and is reverted after; the base is refreshed
 * (reset + snapshot + replay of the last sim to warm the cache) in the background every
 * `refreshIntervalMs`, right away on `invalidate()`, and synchronously only if it is older than
 * `maxForkAgeMs`. A slightly stale fork is acceptable: precheck reads live chain state and
 * Shield 2 is the real guarantee.
 */
export class AnvilSimulator implements SimulatorPort, OnModuleDestroy {
  private readonly log = new Logger(AnvilSimulator.name);
  /** The fork is shared state: one sim (or refresh) at a time. */
  private readonly mutex = new Mutex();
  private readonly opts: Required<AnvilSimulatorOptions>;
  private base: { id: Hex; at: number } | undefined;
  private last: { intent: SwapIntent; target: SimTarget } | undefined;
  private timer: NodeJS.Timeout | undefined;
  private refreshQueued = false;
  /** Index in `forkUrls` of the RPC the fork last reset from successfully. */
  private forkIndex = 0;

  constructor(
    private readonly client: AnvilClient,
    opts: AnvilSimulatorOptions = {},
  ) {
    this.opts = {
      resetFork: opts.resetFork ?? true,
      maxForkAgeMs: opts.maxForkAgeMs ?? 60_000,
      refreshIntervalMs: opts.refreshIntervalMs ?? 20_000,
      agentGasBalance: opts.agentGasBalance ?? parseEther('100'),
      forkUrls: opts.forkUrls ?? [],
      resetTimeoutMs: opts.resetTimeoutMs ?? 10_000,
    };
    if (this.opts.resetFork && this.opts.refreshIntervalMs > 0) {
      this.timer = setInterval(() => this.refreshInBackground(false), this.opts.refreshIntervalMs);
      this.timer.unref();
      this.refreshInBackground(true); // first sim should not pay for the cold reset
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  simulate(intent: SwapIntent, target: SimTarget): Promise<SimResult> {
    if (target.module === zeroAddress || target.safe === zeroAddress) {
      return Promise.reject(new Error('AnvilSimulator: safe/module address is not configured'));
    }
    return this.mutex.run(async () => {
      const t0 = performance.now();
      await this.prepare();
      const tReady = performance.now();
      try {
        const result = await this.execute(intent, target);
        this.last = { intent, target };
        this.timing(result, t0, tReady);
        return result;
      } finally {
        await this.rollback();
      }
    });
  }

  /**
   * Chain state moved under us (our own tx mined, Kill-Switch, setPolicy): refresh the fork in
   * the background. Sims queued meanwhile wait on the mutex and then see the fresh state.
   */
  invalidate(): void {
    this.refreshInBackground(true);
  }

  /** Makes sure a base snapshot exists and is fresh enough. Runs under the mutex. */
  private async prepare() {
    if (!this.opts.resetFork) {
      this.base = { id: await this.client.snapshot(), at: Date.now() };
      return;
    }
    if (!this.base || Date.now() - this.base.at > this.opts.maxForkAgeMs) await this.refresh();
  }

  /** Reverts the sim's writes and re-arms the base (evm_revert consumes the snapshot id). */
  private async rollback() {
    if (!this.base) return;
    const reverted = await this.client.revert({ id: this.base.id }).then(
      () => true,
      () => false,
    );
    if (!reverted) {
      this.base = undefined; // unknown fork state: next sim resets
      return;
    }
    if (this.opts.resetFork) this.base = { id: await this.client.snapshot(), at: this.base.at };
    else this.base = undefined;
  }

  private async refresh() {
    const t0 = performance.now();
    this.base = undefined; // the fork is being replaced: no snapshot of the old one is valid any more
    await this.resetFork();
    this.base = { id: await this.client.snapshot(), at: Date.now() };
    this.log.debug(`fork reset in ${Math.round(performance.now() - t0)} ms`);
  }

  /**
   * `anvil_reset` to the latest Fuji block, bounded. Each fork RPC gets one try of at most `resetTimeoutMs`, starting
   * with the last one that worked, so a stuck public RPC costs seconds instead of holding every sim for minutes.
   * Throws only when every RPC failed (the caller treats it as an infra error).
   */
  private async resetFork() {
    const urls = this.opts.forkUrls;
    if (urls.length === 0) return void (await withTimeout(this.client.reset(), this.opts.resetTimeoutMs, 'anvil_reset'));
    let last: unknown;
    for (let k = 0; k < urls.length; k++) {
      const i = (this.forkIndex + k) % urls.length;
      const url = urls[i]!;
      try {
        await withTimeout(this.client.reset({ jsonRpcUrl: url }), this.opts.resetTimeoutMs, `anvil_reset via ${hostOf(url)}`);
        if (i !== this.forkIndex) this.log.warn(`fork now follows ${hostOf(url)}`);
        this.forkIndex = i;
        return;
      } catch (e) {
        last = e;
        this.log.warn(`fork reset via ${hostOf(url)} failed: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
      }
    }
    throw last;
  }

  private refreshInBackground(force: boolean) {
    if (!this.opts.resetFork || this.refreshQueued) return;
    if (!force && this.base && Date.now() - this.base.at < this.opts.refreshIntervalMs) return;
    this.refreshQueued = true;
    void this.mutex
      .run(async () => {
        this.refreshQueued = false;
        await this.refresh();
        // Warm the lazily fetched fork cache with the last sim so the next one is fast.
        if (this.last) {
          await this.execute(this.last.intent, this.last.target).catch(() => undefined);
          await this.rollback();
        }
      })
      .catch((e: unknown) => {
        this.refreshQueued = false;
        this.base = undefined;
        this.log.warn(`background fork refresh failed: ${e instanceof Error ? e.message : String(e)}`);
      });
  }

  private async execute(intent: SwapIntent, target: SimTarget): Promise<SimResult> {
    const c = this.client;
    const [agentSigner, router] = await c.readContract({
      address: target.module,
      abi: POLICY_MODULE_ABI,
      functionName: 'policy',
    });
    const agent = target.agent ?? agentSigner;
    const block = await c.getBlock();
    const deadline = swapDeadline(block.timestamp);
    const data = encodeGuardedSwap(intent, deadline);
    const watched = this.watchList(intent, target);
    const before = await this.balances(intent, target.safe, watched);

    await c.impersonateAccount({ address: agent });
    try {
      await c.setBalance({ address: agent, value: this.opts.agentGasBalance });
      try {
        await c.call({ account: agent, to: target.module, data, gas: SWAP_GAS });
      } catch (e) {
        const reason = decodeRevert(e);
        if (reason !== 'SwapFailed') return reverted(reason);
        // SwapFailed hides the router's reason (the Safe swallows it): ask the router directly, as the Safe (L6).
        return reverted(
          await probeRouterFailure(c, {
            router,
            safe: target.safe,
            tokenIn: intent.tokenIn,
            tokenOut: intent.tokenOut,
            amountIn: intent.amountIn,
            minOut: intent.minAmountOut,
            deadline,
          }),
        );
      }
      const hash = await c.sendTransaction({ account: agent, chain: avalancheFuji, to: target.module, data, gas: SWAP_GAS });
      const receipt = await c.waitForTransactionReceipt({ hash, pollingInterval: 50 });
      // eth_call passed but the mined tx did not: state changed in between. Never call it safe.
      if (receipt.status !== 'success') return reverted('UNKNOWN_REVERT');
    } finally {
      await c.stopImpersonatingAccount({ address: agent }).catch(() => undefined);
    }

    const [after, allowanceAfter] = await Promise.all([
      this.balances(intent, target.safe, watched),
      c.readContract({ address: intent.tokenIn, abi: ERC20_ABI, functionName: 'allowance', args: [target.safe, router] }),
    ]);
    const attackerGain = after.watched.reduce((sum, v, i) => {
      const d = v - (before.watched[i] ?? 0n);
      return d > 0n ? sum + d : sum;
    }, 0n);
    return {
      ok: true,
      deltaSafeTokenOut: toSignedAmount(after.safeOut - before.safeOut),
      deltaSafeTokenIn: toSignedAmount(after.safeIn - before.safeIn),
      attackerBalance: toAmount(attackerGain),
      allowanceAfter: toAmount(allowanceAfter),
    };
  }

  /** The intent's recipient if it is not the Safe (attack #2), plus explicit watch addresses. */
  private watchList(intent: SwapIntent, target: SimTarget): Address[] {
    const list = [...(target.watch ?? [])];
    if (!isAddressEqual(intent.recipient, target.safe)) list.push(intent.recipient);
    return list.filter((a, i) => list.findIndex((b) => isAddressEqual(a, b)) === i);
  }

  private async balances(intent: SwapIntent, safe: Address, watched: Address[]): Promise<Balances> {
    const bal = (token: Address, owner: Address) =>
      this.client.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] });
    const [safeIn, safeOut, ...rest] = await Promise.all([
      bal(intent.tokenIn, safe),
      bal(intent.tokenOut, safe),
      ...watched.flatMap((w) => [bal(intent.tokenIn, w), bal(intent.tokenOut, w)]),
    ]);
    // Sum tokenIn + tokenOut per watched address: only "did it gain" matters for the invariant.
    const perAddr = watched.map((_, i) => (rest[2 * i] ?? 0n) + (rest[2 * i + 1] ?? 0n));
    return { safeIn: safeIn ?? 0n, safeOut: safeOut ?? 0n, watched: perAddr };
  }

  private timing(result: SimResult, t0: number, tReady: number) {
    const now = performance.now();
    const outcome = result.ok ? 'ok' : `revert ${result.revertReason}`;
    const msg = `sim ${outcome} in ${Math.round(now - t0)} ms (fork ready ${Math.round(tReady - t0)} ms)`;
    if (now - t0 > 1000) this.log.warn(`${msg}: above the 1 s target`);
    else this.log.debug(msg);
  }
}

function reverted(reason: ReasonCode): SimResult {
  return {
    ok: false,
    deltaSafeTokenOut: '0',
    deltaSafeTokenIn: '0',
    attackerBalance: '0',
    allowanceAfter: '0',
    revertReason: reason,
  };
}
