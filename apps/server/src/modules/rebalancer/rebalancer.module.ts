import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';
import { SwapQueueModule } from '../auditor/swap-queue.module';
import { PolicyModule } from '../policy/policy.module';
import { RebalancerProcessor } from './rebalancer.processor';
import { RebalancerScheduler } from './rebalancer.scheduler';

/** Worker process: processor + scheduler. */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.rebalance }), SwapQueueModule, PolicyModule],
  providers: [RebalancerProcessor, RebalancerScheduler],
})
export class RebalancerModule {}
