import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { Address } from 'viem';
import { QUEUES } from '../../core/queue/queue.constants';
import { intentFromWire, type SwapIntentWire } from '../../core/types';
import { AuditorService } from './auditor.service';

export interface SwapJobData {
  jobId: string;
  /** The Safe this swap acts on. The worker resolves its module from the chain. */
  vault: Address;
  intent: SwapIntentWire;
  /** Red-team prompt-injection text. Goes to ExplainInput.untrustedText, nowhere else. */
  untrustedText?: string;
}

/** concurrency: 1 because this path signs; serializes nonce usage (P4). */
@Processor(QUEUES.swap, { concurrency: 1 })
export class AuditorProcessor extends WorkerHost {
  constructor(private readonly auditor: AuditorService) {
    super();
  }

  async process(job: Job<SwapJobData>): Promise<void> {
    const { jobId, vault, intent, untrustedText } = job.data;
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await this.auditor.audit({ jobId, vault, intent: intentFromWire(intent), untrustedText, lastAttempt });
  }
}
