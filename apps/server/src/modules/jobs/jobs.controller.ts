import { Address, JobStatus, problem } from '@agentshield/shared';
import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { JobsService } from './jobs.service';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
  status: JobStatus.optional(),
});

const JobId = z.string().uuid();

function badRequest(title: string, issues: z.ZodIssue[]) {
  const details = issues.map((i) => ({ path: i.path.join('.') || 'query', message: i.message }));
  return new BadRequestException(problem('VALIDATION_ERROR', title, undefined, { details }));
}

/** Read side of jobs (api.md #9, #11). Creating jobs lives with its producers (rebalancer, redteam). */
@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  /** GET /vaults/{safe}/jobs?limit=&cursor=&status= */
  @Get('vaults/:safe/jobs')
  listByVault(@Param('safe') rawSafe: string, @Query() rawQuery: unknown) {
    const safe = Address.safeParse(rawSafe);
    if (!safe.success) throw badRequest('Invalid vault address', safe.error.issues);
    const q = ListQuery.safeParse(rawQuery);
    if (!q.success) throw badRequest('Invalid query', q.error.issues);
    return this.jobs.listByVault({ vault: safe.data, ...q.data });
  }

  /** GET /jobs/{id}: JobDto + precheck, sim and the per-shield audit trail. */
  @Get('jobs/:id')
  async get(@Param('id') rawId: string) {
    const id = JobId.safeParse(rawId);
    if (!id.success) throw badRequest('Invalid job id', id.error.issues);
    const job = await this.jobs.detail(id.data);
    if (!job) throw new NotFoundException(problem('JOB_NOT_FOUND', 'Job not found', id.data));
    return job;
  }
}
