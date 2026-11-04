import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsRepository } from './jobs.repository';
import { JobsService } from './jobs.service';

/** Loaded by both processes; the controller is simply unused when only the worker boots HTTP-less. */
@Module({
  controllers: [JobsController],
  providers: [JobsRepository, JobsService],
  exports: [JobsService],
})
export class JobsModule {}
