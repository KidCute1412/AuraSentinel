import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { QUEUES } from './core/queue/queue.constants';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ProofModule } from './modules/proof/proof.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RebalancerApiModule } from './modules/rebalancer/rebalancer-api.module';
import { RedteamApiModule } from './modules/redteam/redteam-api.module';
import { VaultModule } from './modules/vault/vault.module';

/** HTTP process: no queue processors, no session key. */
@Module({
  imports: [
    CoreModule,
    BullModule.registerQueue(...Object.values(QUEUES).map((name) => ({ name }))),
    BullBoardModule.forRoot({ route: '/admin/queues', adapter: ExpressAdapter }),
    BullBoardModule.forFeature(
      ...Object.values(QUEUES).map((name) => ({ name, adapter: BullMQAdapter })),
    ),
    HealthModule,
    AuthModule,
    AdminModule,
    VaultModule,
    JobsModule,
    ProofModule,
    RealtimeModule,
    RebalancerApiModule,
    RedteamApiModule,
  ],
})
export class ApiAppModule {}
