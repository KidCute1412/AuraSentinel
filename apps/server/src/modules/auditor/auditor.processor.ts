import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUES } from '../../core/queue/queue.constants';
import { intentFromWire, type SwapIntentWire } from '../../core/types';
import { AuditorService } from './auditor.service';

export interface SwapJobData {
  jobId: string;
  intent: SwapIntentWire;
  /** Red-team prompt-injection text. TODO(A6): pass to ExplainInput.untrustedText, nowhere else. */
  untrustedText?: string;
}

/** concurrency: 1 because this path signs; serializes nonce usage. */
@Processor(QUEUES.swap, { concurrency: 1 })
export class AuditorProcessor extends WorkerHost {
  constructor(private readonly auditor: AuditorService) {
    super();
  }

  async process(job: Job<SwapJobData>): Promise<void> {
    await this.auditor.audit(job.data.jobId, intentFromWire(job.data.intent));
  }
}
