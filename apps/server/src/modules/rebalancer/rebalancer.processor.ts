import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';

/**
 * TODO(FS2, after A3/A6): tick -> for every registered vault read a VaultSnapshot from the chain
 * (balances, getAmountsOut quote -> priceFromQuote, per-token limits + spentToday, isActive,
 * expiry, block timestamp, pending swap job) -> planTick(snapshots, blockNumber) -> enqueue each
 * 'swap' decision with BullMQ jobId = decision.jobId so a repeated tick cannot duplicate it.
 * All decisions are in domain/rebalance.plan.ts (Q7); this processor only does I/O.
 */
@Processor(QUEUES.rebalance, { concurrency: 1 })
export class RebalancerProcessor extends WorkerHost {
  private readonly log = new Logger(RebalancerProcessor.name);

  async process(): Promise<void> {
    this.log.debug('rebalance tick');
  }
}
