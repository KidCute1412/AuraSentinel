import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { QUEUES } from '../../core/queue/queue.constants';

const SCHEDULER_ID = 'rebalance-tick';

@Injectable()
export class RebalancerScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUES.rebalance) private readonly queue: Queue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(SCHEDULER_ID, { every: this.env.REBALANCE_INTERVAL_MS }, { name: 'tick' });
  }

  async pause() {
    await this.queue.removeJobScheduler(SCHEDULER_ID);
  }

  async resume() {
    await this.onApplicationBootstrap();
  }
}
