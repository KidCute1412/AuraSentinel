import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { ProofController } from './proof.controller';
import { ProofService } from './proof.service';

/** API-only: read-side evidence for the /proof page. */
@Module({
  imports: [JobsModule],
  controllers: [ProofController],
  providers: [ProofService],
})
export class ProofModule {}
