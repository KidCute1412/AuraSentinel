import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';
import { JobsModule } from '../jobs/jobs.module';
import { SwapQueueService } from './swap-queue.service';

/** Producer-only slice of auditor, importable by rebalancer / redteam in either process. */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.swap }), JobsModule],
  providers: [SwapQueueService],
  exports: [SwapQueueService],
})
export class SwapQueueModule {}
