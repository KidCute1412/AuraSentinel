import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';
import { RebalancerController } from './rebalancer.controller';

/** API process: controller + queue producer only (no processor, no scheduler). */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.rebalance })],
  controllers: [RebalancerController],
})
export class RebalancerApiModule {}
