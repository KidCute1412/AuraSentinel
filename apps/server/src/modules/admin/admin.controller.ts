import { UpdateRebalancerRequest, problem, type AdminOverviewDto, type JobListDto, type PreflightDto, type RebalancerStatusDto, type RunTickResponse } from '@agentshield/shared';
import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService, JOB_FILTERS, type JobFilter } from './admin.service';

const JobsQuery = z.object({
  filter: z.enum(Object.keys(JOB_FILTERS) as [JobFilter, ...JobFilter[]]).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

/**
 * Admin console (api.md §9, page /admin): Demo Day preflight, the rebalancer's switch, activity across every vault.
 * Read-only apart from pausing or nudging the rebalancer: no route here holds a key or touches funds or policy (P2).
 * Pausing the BullMQ queue is stored in Redis, so it holds across the API and worker processes and survives restarts.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** #15 */
  @Get('rebalancer')
  status(): Promise<RebalancerStatusDto> {
    return this.admin.rebalancer();
  }

  /** #16. Idempotent: setting the current value again is a no-op that returns the same resource. */
  @Patch('rebalancer')
  update(@Body() body: unknown): Promise<RebalancerStatusDto> {
    const req = UpdateRebalancerRequest.safeParse(body);
    if (!req.success) throw new BadRequestException(problem('VALIDATION_ERROR', 'Body must be { paused: boolean }'));
    return this.admin.setPaused(req.data.paused);
  }

  /** #15b. A paused queue would hold the job until Resume, so refuse instead of queuing silently. */
  @Post('rebalancer/ticks')
  @HttpCode(202)
  async tick(): Promise<RunTickResponse> {
    if (await this.admin.isPaused()) {
      throw new ConflictException(problem('REBALANCER_PAUSED', 'Demo mode is on', 'Resume the rebalancer to run a tick.'));
    }
    return this.admin.runTick();
  }

  /** #19 */
  @Get('preflight')
  preflight(): Promise<PreflightDto> {
    return this.admin.preflight();
  }

  /** #20 */
  @Get('overview')
  overview(): Promise<AdminOverviewDto> {
    return this.admin.overview();
  }

  /** #21: GET /admin/jobs?filter=all|blocked|failed&limit=&cursor= */
  @Get('jobs')
  jobs(@Query() raw: unknown): Promise<JobListDto> {
    const q = JobsQuery.safeParse(raw);
    if (!q.success) throw new BadRequestException(problem('VALIDATION_ERROR', 'Invalid query', 'filter is all, blocked or failed; limit 1-100'));
    return this.admin.jobsList(q.data.filter, q.data.limit, q.data.cursor);
  }
}
