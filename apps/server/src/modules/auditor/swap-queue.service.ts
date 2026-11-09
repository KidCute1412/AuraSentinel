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

  /**
   * Creates the job row and queues it for the Auditor. `untrustedText` (red-team injection box)
   * travels with the job so the Auditor can hand it to the explainer as <untrusted_input>; it
   * never reaches precheck, simulation or signing.
   */
  async enqueue(kind: string, intent: SwapIntent, opts: { untrustedText?: string } = {}): Promise<string> {
    const wire = intentToWire(intent);
    const job = await this.jobs.create(kind, wire);
    const data: SwapJobData = { jobId: job.id, intent: wire };
    if (opts.untrustedText) data.untrustedText = opts.untrustedText;
    await this.queue.add('audit', data, { jobId: job.id });
    return job.id;
  }
}
