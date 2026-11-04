import { Injectable } from '@nestjs/common';
import { EventBus } from '../../core/redis/event-bus';
import type { JobStatus } from '../../core/types';
import { JobsRepository } from './jobs.repository';

@Injectable()
export class JobsService {
  constructor(
    private readonly repo: JobsRepository,
    private readonly bus: EventBus,
  ) {}

  create(kind: string, intent?: unknown) {
    return this.repo.create(kind, intent);
  }

  /** Persist the transition, write the audit trail, then publish job.updated. */
  async transition(jobId: string, status: JobStatus, patch: Record<string, unknown> = {}) {
    const row = await this.repo.update(jobId, { status, ...patch });
    await this.repo.appendAudit(jobId, status, patch);
    await this.bus.publish({ type: 'job.updated', jobId, status, patch });
    return row;
  }

  list(limit?: number) {
    return this.repo.list(limit);
  }

  get(id: string) {
    return this.repo.get(id);
  }
}
