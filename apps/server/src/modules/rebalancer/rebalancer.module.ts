import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';
import { SwapQueueModule } from '../auditor/swap-queue.module';
import { PolicyModule } from '../policy/policy.module';
import { VaultModule } from '../vault/vault.module';
import { RebalanceSnapshotService } from './rebalance-snapshot.service';
import { RebalancerProcessor } from './rebalancer.processor';
import { RebalancerScheduler } from './rebalancer.scheduler';
import { RouterQuoteService } from './router-quote.service';

/** Worker process: processor + scheduler. */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.rebalance }), SwapQueueModule, PolicyModule, VaultModule],
  providers: [RebalancerProcessor, RebalancerScheduler, RebalanceSnapshotService, RouterQuoteService],
})
export class RebalancerModule {}
