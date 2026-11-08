import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';
import { SwapQueueModule } from '../auditor/swap-queue.module';
import { JobsModule } from '../jobs/jobs.module';
import { RedteamController } from './redteam.controller';

/** API process: controller + producers only (swap queue for Shield 1 attacks, attack queue for on-chain ones). */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.attack }), SwapQueueModule, JobsModule],
  controllers: [RedteamController],
})
export class RedteamApiModule {}
