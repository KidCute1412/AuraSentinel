import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';
import { ExecutionModule } from '../execution/execution.module';
import { ExplainerModule } from '../explainer/explainer.module';
import { JobsModule } from '../jobs/jobs.module';
import { PolicyModule } from '../policy/policy.module';
import { SimulationModule } from '../simulation/simulation.module';
import { VaultModule } from '../vault/vault.module';
import { AuditorProcessor } from './auditor.processor';
import { AuditorService } from './auditor.service';

/** Worker-only. Producers enqueue to the `swap` queue via SwapQueueModule. */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.swap }),
    JobsModule,
    PolicyModule,
    SimulationModule,
    ExecutionModule,
    ExplainerModule,
    VaultModule,
  ],
  providers: [AuditorService, AuditorProcessor],
})
export class AuditorModule {}
