import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';
import { AgentBrainModule } from '../agent-brain/agent-brain.module';
import { SwapQueueModule } from '../auditor/swap-queue.module';
import { ExecutionModule } from '../execution/execution.module';
import { JobsModule } from '../jobs/jobs.module';
import { PolicyModule } from '../policy/policy.module';
import { RouterQuoteService } from '../rebalancer/router-quote.service';
import { VaultModule } from '../vault/vault.module';
import { HijackService } from './hijack.service';
import { RedteamProcessor } from './redteam.processor';

/**
 * Worker process: attack queue consumer (on-chain attacks #3, #4, and Hijacked Agent runs). ExecutionModule is the
 * same module instance the Auditor imports, so both queues share one TxSender (P4). Hijacked swaps go back through
 * the swap queue as dryRun jobs (SwapQueueModule).
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.attack }), JobsModule, ExecutionModule, VaultModule, PolicyModule, AgentBrainModule, SwapQueueModule],
  providers: [RedteamProcessor, HijackService, RouterQuoteService],
})
export class RedteamModule {}
