import type { Explanation, JobDetailDto, JobDto, JobListDto } from '@agentshield/shared';
import { Injectable } from '@nestjs/common';
import { EventBus } from '../../core/redis/event-bus';
import type { JobStatus } from '../../core/types';
import { toJobDetail, toJobDto, type Shield } from './job.mapper';
import { JobsRepository, type ListByVault } from './jobs.repository';

/** Columns the auditor / red-team may set alongside a status change. */
export interface TransitionPatch {
  precheck?: { ok: boolean; reasons: string[] };
  simResult?: unknown;
  reasonCode?: string | null;
  txHash?: string | null;
  explanation?: Explanation;
}

@Injectable()
export class JobsService {
  constructor(
    private readonly repo: JobsRepository,
    private readonly bus: EventBus,
  ) {}

  async create(vault: string, kind: string, intent?: unknown): Promise<JobDto> {
    const row = await this.repo.create(vault, kind, intent);
    await this.publishUpdated(toJobDto(row));
    return toJobDto(row);
  }

  /** Persist the transition, write the audit trail, then publish job.updated with the full JobDto. */
  async transition(jobId: string, status: JobStatus, patch: TransitionPatch = {}): Promise<JobDto | undefined> {
    const row = await this.repo.update(jobId, { status, ...patch });
    await this.repo.appendAudit(jobId, status, patch);
    if (!row) return undefined;
    const dto = toJobDto(row);
    await this.publishUpdated(dto);
    return dto;
  }

  /** One Shield verdict for GET /jobs/{id}.audit (precheck, simulation, invariant, onchain). */
  recordShield(jobId: string, shield: Shield, result: 'pass' | 'fail', reason: string | null = null) {
    return this.repo.appendAudit(jobId, shield, { result, reason });
  }

  /**
   * The explainer runs beside the broadcast (P3), so this can land before or after the terminal
   * status. It only touches `explanation`, never status/txHash.
   */
  async attachExplanation(jobId: string, explanation: Explanation): Promise<void> {
    const row = await this.repo.update(jobId, { explanation });
    if (!row) return;
    await this.bus.publish({ type: 'job.explained', vault: toJobDto(row).vault, jobId, explanation });
  }

  list(limit?: number) {
    return this.repo.list(limit).then((rows) => rows.map(toJobDto));
  }

  async listByVault(q: ListByVault): Promise<JobListDto> {
    const rows = await this.repo.listByVault(q);
    const items = rows.slice(0, q.limit).map(toJobDto);
    return { items, nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null };
  }

  async get(id: string): Promise<JobDto | undefined> {
    const row = await this.repo.get(id);
    return row && toJobDto(row);
  }

  async detail(id: string): Promise<JobDetailDto | undefined> {
    const row = await this.repo.get(id);
    if (!row) return undefined;
    return toJobDetail(row, await this.repo.audit(id));
  }

  private publishUpdated(job: JobDto) {
    return this.bus.publish({ type: 'job.updated', vault: job.vault, job });
  }
}
