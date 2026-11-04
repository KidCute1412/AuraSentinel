import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';
import { SwapQueueModule } from '../auditor/swap-queue.module';
import { RedteamProcessor } from './redteam.processor';

/** Worker process: attack queue consumer. */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.attack }), SwapQueueModule],
  providers: [RedteamProcessor],
})
export class RedteamModule {}
