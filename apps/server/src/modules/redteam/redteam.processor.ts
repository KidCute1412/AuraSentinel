import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { QUEUES } from '../../core/queue/queue.constants';
import { SwapQueueService } from '../auditor/swap-queue.service';
import { SCENARIOS } from './scenarios';

@Processor(QUEUES.attack, { concurrency: 1 })
export class RedteamProcessor extends WorkerHost {
  constructor(
    private readonly swapQueue: SwapQueueService,
    @Inject(ENV) private readonly env: Env,
  ) {
    super();
  }

  async process(job: Job<{ scenario: string }>) {
    const scenario = SCENARIOS[job.data.scenario];
    if (!scenario) throw new Error(`unknown scenario: ${job.data.scenario}`);
    return scenario.run({ env: this.env, enqueueSwap: (kind, intent) => this.swapQueue.enqueue(kind, intent) });
  }
}
