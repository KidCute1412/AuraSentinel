import { InjectQueue } from '@nestjs/bullmq';
import { Controller, HttpCode, Post } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QUEUES } from '../../core/queue/queue.constants';

/** API-side: only enqueues. The scheduler/processor live in the worker. */
@Controller()
export class RebalancerController {
  constructor(@InjectQueue(QUEUES.rebalance) private readonly queue: Queue) {}

  @Post('rebalance')
  @HttpCode(202)
  async run() {
    await this.queue.add('tick', {});
    return { queued: true };
  }
}
