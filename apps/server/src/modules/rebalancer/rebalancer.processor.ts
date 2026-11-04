import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';

/** TODO(FS2): tick -> read balances/prices from chain -> computeRebalance -> SwapQueueService.enqueue('rebalance', intent). */
@Processor(QUEUES.rebalance, { concurrency: 1 })
export class RebalancerProcessor extends WorkerHost {
  private readonly log = new Logger(RebalancerProcessor.name);

  async process(): Promise<void> {
    this.log.debug('rebalance tick');
  }
}
