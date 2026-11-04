import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QUEUES } from '../../core/queue/queue.constants';
import { intentToWire, type SwapIntent } from '../../core/types';
import { JobsService } from '../jobs/jobs.service';
import type { SwapJobData } from './auditor.processor';

/** Producer side of the swap queue. Safe to load in the API process (no processor registered here). */
@Injectable()
export class SwapQueueService {
  constructor(
    @InjectQueue(QUEUES.swap) private readonly queue: Queue<SwapJobData>,
    private readonly jobs: JobsService,
  ) {}

  async enqueue(kind: string, intent: SwapIntent): Promise<string> {
    const wire = intentToWire(intent);
    const job = await this.jobs.create(kind, wire);
    await this.queue.add('audit', { jobId: job.id, intent: wire }, { jobId: job.id });
    return job.id;
  }
}
