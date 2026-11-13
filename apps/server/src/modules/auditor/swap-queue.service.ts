import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Address } from 'viem';
import { QUEUES } from '../../core/queue/queue.constants';
import { intentToWire, type SwapIntent } from '../../core/types';
import { JobsService } from '../jobs/jobs.service';
import type { SwapJobData } from './auditor.processor';

/**
 * Infra errors before broadcast (RPC read, fork) get 3 attempts with backoff. The Auditor turns
 * every non-retryable outcome (a verdict, a revert, anything after broadcast) into an
 * UnrecoverableError, so a swap is never sent twice (invariant 7).
 */
const RETRY = { attempts: 3, backoff: { type: 'exponential', delay: 1_000 } } as const;

/** Producer side of the swap queue. Safe to load in the API process (no processor registered here). */
@Injectable()
export class SwapQueueService {
  constructor(
    @InjectQueue(QUEUES.swap) private readonly queue: Queue<SwapJobData>,
    private readonly jobs: JobsService,
  ) {}

  /**
   * Creates the job row and queues it for the Auditor. `vault` is the Safe the swap acts on; the
   * worker resolves its module again, it never trusts `intent.recipient`. `untrustedText`
   * (red-team injection box) travels with the job so the Auditor can hand it to the explainer as
   * <untrusted_input>; it never reaches precheck, simulation or signing.
   */
  async enqueue(vault: Address, kind: string, intent: SwapIntent, opts: { untrustedText?: string } = {}): Promise<string> {
    const wire = intentToWire(intent);
    const job = await this.jobs.create(vault, kind, wire);
    const data: SwapJobData = { jobId: job.id, vault, intent: wire };
    if (opts.untrustedText) data.untrustedText = opts.untrustedText;
    await this.queue.add('audit', data, { jobId: job.id, ...RETRY });
    return job.id;
  }

  /** A swap for this vault is waiting or running (409 QUEUE_BUSY, rebalancer idempotency). */
  async hasPending(vault: Address): Promise<boolean> {
    const pending = await this.queue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
    const v = vault.toLowerCase();
    return pending.some((j) => j?.data?.vault?.toLowerCase() === v);
  }
}
