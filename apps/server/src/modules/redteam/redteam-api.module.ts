import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';
import { RedteamController } from './redteam.controller';

/** API process: controller + producer only. */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.attack })],
  controllers: [RedteamController],
})
export class RedteamApiModule {}
