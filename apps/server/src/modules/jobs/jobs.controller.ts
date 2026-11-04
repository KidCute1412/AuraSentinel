import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list() {
    return this.jobs.list();
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const job = await this.jobs.get(id);
    if (!job) throw new NotFoundException();
    return job;
  }
}
