import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WriteGuardModule } from '../write-guard/write-guard.module';
import { AgentBrainModule } from '../agent-brain/agent-brain.module';
import { QUEUES } from '../../core/queue/queue.constants';
import { SwapQueueModule } from '../auditor/swap-queue.module';
import { JobsModule } from '../jobs/jobs.module';
import { RedteamController } from './redteam.controller';

/**
 * API process: controller + producers only (swap queue for Shield 1 attacks, attack queue for on-chain ones and
 * Hijacked Agent runs). AgentBrainModule writes the Auto red-team prompts; it never signs.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.attack }), SwapQueueModule, JobsModule, WriteGuardModule, AgentBrainModule],
  controllers: [RedteamController],
})
export class RedteamApiModule {}
