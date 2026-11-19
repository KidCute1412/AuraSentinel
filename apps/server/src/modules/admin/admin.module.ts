import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../core/queue/queue.constants';
import { AuthModule } from '../auth/auth.module';
import { HealthModule } from '../health/health.module';
import { IndexerRepository } from '../indexer/indexer.repository';
import { JobsModule } from '../jobs/jobs.module';
import { ProofModule } from '../proof/proof.module';
import { VaultModule } from '../vault/vault.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * API-only: /admin/* behind AdminGuard. The indexer's repository is provided here on its own (it only reads the
 * cursor row): importing IndexerModule would start the indexer's polling in the API process.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.rebalance }, { name: QUEUES.swap }, { name: QUEUES.attack }),
    AuthModule,
    HealthModule,
    JobsModule,
    ProofModule,
    VaultModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, IndexerRepository],
})
export class AdminModule {}
