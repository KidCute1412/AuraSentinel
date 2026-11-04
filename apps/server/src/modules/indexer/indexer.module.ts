import { Module } from '@nestjs/common';
import { PolicyModule } from '../policy/policy.module';
import { IndexerRepository } from './indexer.repository';
import { IndexerService } from './indexer.service';

@Module({
  imports: [PolicyModule],
  providers: [IndexerRepository, IndexerService],
})
export class IndexerModule {}
