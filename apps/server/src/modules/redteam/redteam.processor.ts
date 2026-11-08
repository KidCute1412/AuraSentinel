import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { QUEUES } from '../../core/queue/queue.constants';
import { JobsService } from '../jobs/jobs.service';
import { buildOnchainCall, type RawCall } from './onchain-calls';
import type { AttackJobData } from './redteam.controller';
import { attackContext, SCENARIOS } from './scenarios';

/**
 * Worker side of the on-chain attacks (#3 unlimited approval, #4 bypass). concurrency 1: these
 * are signed with the same session key as swaps (P4).
 *
 * Today it builds the exact transaction and stops: sending needs TxSender.sendRaw (A4, manual
 * gas, revert is a result not an error) and a deployed module (L4). Until then the job ends as
 * `failed`, never as a fake revert. TODO(A4): inject the shared TxSender as RawTxSender, send
 * `call`, then transition to `reverted` with txHash + decoded error (revert-decoder, L6), or
 * `confirmed` (which would be a security bug worth an alarm).
 */
@Processor(QUEUES.attack, { concurrency: 1 })
export class RedteamProcessor extends WorkerHost {
  private readonly log = new Logger(RedteamProcessor.name);

  constructor(
    private readonly jobs: JobsService,
    @Inject(ENV) private readonly env: Env,
  ) {
    super();
  }

  async process(job: Job<AttackJobData>): Promise<RawCall | null> {
    const { jobId, vault, scenario } = job.data;
    const plan = SCENARIOS[scenario].plan(attackContext(this.env, vault));
    const module = this.env.POLICY_MODULE_ADDRESS;
    if (plan.mode !== 'onchain' || !module) {
      this.log.warn(`attack ${scenario} (${jobId}) cannot run: ${!module ? 'POLICY_MODULE_ADDRESS not set' : 'not an on-chain plan'}`);
      await this.jobs.transition(jobId, 'failed');
      return null;
    }
    const call = buildOnchainCall(plan, { safe: vault, module }, BigInt(Math.floor(Date.now() / 1000)));
    this.log.warn(`attack ${scenario} (${jobId}) built for ${call.to}, not sent: TxSender.sendRaw (A4) not available yet`);
    await this.jobs.transition(jobId, 'failed');
    return call;
  }
}
