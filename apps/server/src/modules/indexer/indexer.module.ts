import { Module } from '@nestjs/common';
import { SimulationModule } from '../simulation/simulation.module';
import { VaultModule } from '../vault/vault.module';
import { IndexerRepository } from './indexer.repository';
import { IndexerService } from './indexer.service';

/** Worker-only. SimulationModule is the same instance the Auditor uses, so invalidate() refreshes its fork. */
@Module({
  imports: [VaultModule, SimulationModule],
  providers: [IndexerRepository, IndexerService],
})
export class IndexerModule {}
