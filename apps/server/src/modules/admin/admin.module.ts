import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';

/** API-only: /admin/* behind AdminGuard. */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.rebalance }), AuthModule],
  controllers: [AdminController],
})
export class AdminModule {}
