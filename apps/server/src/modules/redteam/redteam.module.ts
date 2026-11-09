import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';
import { JobsModule } from '../jobs/jobs.module';
import { RedteamProcessor } from './redteam.processor';

/** Worker process: attack queue consumer (on-chain attacks #3, #4). */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.attack }), JobsModule],
  providers: [RedteamProcessor],
})
export class RedteamModule {}
