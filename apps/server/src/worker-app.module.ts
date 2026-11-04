import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { AuditorModule } from './modules/auditor/auditor.module';
import { IndexerModule } from './modules/indexer/indexer.module';
import { RebalancerModule } from './modules/rebalancer/rebalancer.module';
import { RedteamModule } from './modules/redteam/redteam.module';

/** Worker process: BullMQ processors, scheduler, indexer. Opens no HTTP port. */
@Module({
  imports: [CoreModule, RebalancerModule, AuditorModule, RedteamModule, IndexerModule],
})
export class WorkerAppModule {}
