import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { getAddress, type Address, type PublicClient } from 'viem';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { QUEUES } from '../../core/queue/queue.constants';
import { REDIS } from '../../core/redis/redis.constants';
import { SwapQueueService } from '../auditor/swap-queue.service';
import { VaultRegistryService } from '../vault/vault-registry.service';
import { minOutFromQuote } from './domain/manual-rebalance';
import { planTick, type SkipReason, type VaultDecision } from './domain/rebalance.plan';
import { REBALANCE_SLIPPAGE_BPS } from './domain/rebalance.snapshot';
import { RebalanceSnapshotService, type LoadedVault } from './rebalance-snapshot.service';
import { RouterQuoteService } from './router-quote.service';

/** Outlives a 10-block bucket (~20 s on Fuji) by far; each bucket has its own key anyway. */
export const CLAIM_TTL_SECONDS = 600;
export const claimKey = (jobId: string) => `rebalance:claim:${jobId}`;

type TickSkip = SkipReason | 'not-a-vault' | 'read-failed' | 'no-quote-for-amount' | 'duplicate' | 'enqueue-failed';

export interface TickSummary {
  blockNumber: string | null;
  /** Job ids (jobs table) queued for the Auditor this tick. */
  queued: string[];
  skipped: { safe: string; reason: TickSkip }[];
}

type SwapDecision = Extract<VaultDecision, { action: 'swap' }>;

/**
 * The 24/7 rebalancer (Q7). Each tick: take every vault in the registry (A8), read it from the chain, let the pure
 * planner decide (domain/rebalance.plan.ts, no LLM), and queue the swaps for the Auditor. It
 * never signs: the Auditor runs Shield 1 and the module (Shield 2) still has the last word.
 *
 * Idempotency (system-design §4.2): a vault with a swap still queued is skipped, and each
 * decision claims `rebalance:{safe}:{floor(block/10)}` in Redis, so a tick that fires again
 * before the previous swap is mined cannot queue a second one.
 */
@Processor(QUEUES.rebalance, { concurrency: 1 })
export class RebalancerProcessor extends WorkerHost {
  private readonly log = new Logger(RebalancerProcessor.name);
  private warnedNoTokens = false;

  constructor(
    private readonly registry: VaultRegistryService,
    private readonly snapshots: RebalanceSnapshotService,
    private readonly quotes: RouterQuoteService,
    private readonly swapQueue: SwapQueueService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
    @Inject(ENV) private readonly env: Env,
  ) {
    super();
  }

  process(): Promise<TickSummary> {
    return this.tick();
  }

  async tick(): Promise<TickSummary> {
    const summary: TickSummary = { blockNumber: null, queued: [], skipped: [] };
    const { TOKEN_A_ADDRESS: tokenA, TOKEN_B_ADDRESS: tokenB } = this.env;
    if (!tokenA || !tokenB) {
      if (!this.warnedNoTokens) this.log.warn('rebalancer idle: TOKEN_A_ADDRESS and TOKEN_B_ADDRESS are not configured');
      this.warnedNoTokens = true;
      return summary;
    }

    // Every vault the indexer registered. The public demo vault is driven by visitors only (D15):
    // skipped here before any chain read.
    const safes: Address[] = [];
    for (const v of await this.registry.list()) {
      if (v.isDemo) summary.skipped.push({ safe: getAddress(v.safe), reason: 'demo-vault' });
      else safes.push(getAddress(v.safe));
    }
    if (safes.length === 0) return summary;

    const blockNumber = await this.client.getBlockNumber();
    summary.blockNumber = blockNumber.toString();

    const loaded: LoadedVault[] = [];
    for (const safe of safes) {
      try {
        const vault = await this.snapshots.read(safe, tokenA, tokenB);
        if (vault) loaded.push(vault);
        else summary.skipped.push({ safe, reason: 'not-a-vault' });
      } catch (e) {
        // One vault's RPC failure must not stop the others; the next tick retries it.
        this.log.warn(`rebalance: could not read ${safe}: ${errorMessage(e)}`);
        summary.skipped.push({ safe, reason: 'read-failed' });
      }
    }

    const decisions = planTick(
      loaded.map((v) => v.snapshot),
      blockNumber,
    );
    for (const decision of decisions) {
      if (decision.action === 'skip') {
        summary.skipped.push({ safe: decision.safe, reason: decision.reason });
        continue;
      }
      const vault = loaded.find((v) => v.snapshot.safe === decision.safe)!;
      const outcome = await this.queueSwap(decision, vault);
      if (outcome.queued) summary.queued.push(outcome.jobId);
      else summary.skipped.push({ safe: decision.safe, reason: outcome.reason });
    }

    if (summary.queued.length > 0) this.log.log(`rebalance tick @${blockNumber}: queued ${summary.queued.length}`);
    this.log.debug(`rebalance tick @${blockNumber}: ${JSON.stringify(summary.skipped)}`);
    return summary;
  }

  /**
   * minOut comes from a quote of the exact amount and direction being swapped (D8), the same
   * rule as a manual rebalance, so price impact on a thin pool cannot make the swap revert.
   */
  private async queueSwap(
    d: SwapDecision,
    { snapshot: { safe }, router }: LoadedVault,
  ): Promise<{ queued: true; jobId: string } | { queued: false; reason: TickSkip }> {
    const { intent } = d;
    let quoted: bigint;
    try {
      quoted = await this.quotes.amountOut(router, intent.tokenIn, intent.tokenOut, intent.amountIn);
    } catch (e) {
      this.log.warn(`rebalance: quote failed for ${d.safe}: ${errorMessage(e)}`);
      return { queued: false, reason: 'read-failed' };
    }
    const minAmountOut = minOutFromQuote(quoted, REBALANCE_SLIPPAGE_BPS);
    if (minAmountOut === 0n) return { queued: false, reason: 'no-quote-for-amount' };

    const key = claimKey(d.jobId);
    const claimed = await this.redis.set(key, '1', 'EX', CLAIM_TTL_SECONDS, 'NX');
    if (claimed !== 'OK') return { queued: false, reason: 'duplicate' };

    try {
      // The target is the Safe the registry resolved, never read back from the intent.
      const jobId = await this.swapQueue.enqueue(safe, 'rebalance', { ...intent, minAmountOut });
      this.log.log(`rebalance ${d.safe}: ${intent.amountIn} ${intent.tokenIn} -> ${intent.tokenOut} (job ${jobId})`);
      return { queued: true, jobId };
    } catch (e) {
      // Release the claim so the next tick can try again.
      await this.redis.del(key).catch(() => undefined);
      this.log.error(`rebalance: enqueue failed for ${d.safe}: ${errorMessage(e)}`);
      return { queued: false, reason: 'enqueue-failed' };
    }
  }
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
