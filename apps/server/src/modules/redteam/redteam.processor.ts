import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { QUEUES } from '../../core/queue/queue.constants';
import { TX_SENDER, type TxResult, type TxSenderPort } from '../execution/tx-sender.port';
import { JobsService } from '../jobs/jobs.service';
import { buildOnchainCall } from './onchain-calls';
import type { AttackJobData } from './redteam.controller';
import { attackContext, SCENARIOS } from './scenarios';

/**
 * Worker side of the on-chain attacks (#3 unlimited approval, #4 bypass). concurrency 1, and the
 * same TxSender instance as swaps (one mutex, one nonce chain: P4).
 *
 * The call skips Shield 1 and goes straight to Fuji with manual gas, so Shield 2's revert is mined:
 * - reverted  -> job `reverted` with txHash + decoded reason (the expected outcome);
 * - success   -> job `confirmed`, logged as a SECURITY alarm (Shield 2 let an attack through);
 * - infra error or no session key -> job `failed`, never a fake revert.
 */
@Processor(QUEUES.attack, { concurrency: 1 })
export class RedteamProcessor extends WorkerHost {
  private readonly log = new Logger(RedteamProcessor.name);

  constructor(
    private readonly jobs: JobsService,
    @Inject(ENV) private readonly env: Env,
    @Inject(TX_SENDER) private readonly sender: TxSenderPort,
  ) {
    super();
  }

  async process(job: Job<AttackJobData>): Promise<TxResult | null> {
    const { jobId, vault, scenario } = job.data;
    const plan = SCENARIOS[scenario].plan(attackContext(this.env, vault));
    const module = this.env.POLICY_MODULE_ADDRESS;
    if (plan.mode !== 'onchain' || !module) {
      this.log.warn(`attack ${scenario} (${jobId}) cannot run: ${!module ? 'POLICY_MODULE_ADDRESS not set' : 'not an on-chain plan'}`);
      await this.jobs.transition(jobId, 'failed');
      return null;
    }
    const call = buildOnchainCall(plan, { safe: vault, module }, BigInt(Math.floor(Date.now() / 1000)));
    await this.jobs.transition(jobId, 'broadcasting');

    let tx: TxResult;
    try {
      tx = await this.sender.sendRaw(call);
    } catch (e) {
      this.log.error(`attack ${scenario} (${jobId}) not sent: ${e instanceof Error ? e.message : String(e)}`);
      await this.jobs.transition(jobId, 'failed');
      return null;
    }

    if (tx.status === 'reverted') {
      await this.jobs.transition(jobId, 'reverted', { txHash: tx.txHash, reasonCode: tx.revertReason ?? 'UNKNOWN_REVERT' });
    } else {
      this.log.error(`SECURITY: attack ${scenario} (${jobId}) was NOT reverted on-chain: ${tx.txHash}`);
      await this.jobs.transition(jobId, 'confirmed', { txHash: tx.txHash });
    }
    return tx;
  }
}
