import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, lt, or, type SQL } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../core/database/database.module';
import { auditLog, jobs } from '../../core/database/schema';
import type { JobStatus } from '../../core/types';

type JobPatch = Partial<Omit<typeof jobs.$inferInsert, 'id' | 'createdAt' | 'vault'>>;

export interface ListByVault {
  vault: string;
  limit: number;
  /** Id of the last job of the previous page. */
  cursor?: string;
  status?: JobStatus;
}

/** Sole owner of `jobs` and `audit_log` tables. Vault addresses are stored lowercase. */
@Injectable()
export class JobsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(vault: string, kind: string, intent?: unknown) {
    const [row] = await this.db.insert(jobs).values({ vault: vault.toLowerCase(), kind, intent }).returning();
    return row!;
  }

  async update(id: string, patch: JobPatch) {
    const [row] = await this.db
      .update(jobs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return row;
  }

  list(limit = 50) {
    return this.db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(limit);
  }

  /** Newest first, keyset-paginated on (createdAt, id). Returns up to limit + 1 rows so the caller can tell if there is a next page. */
  async listByVault({ vault, limit, cursor, status }: ListByVault) {
    const where: (SQL | undefined)[] = [eq(jobs.vault, vault.toLowerCase())];
    if (status) where.push(eq(jobs.status, status));
    if (cursor) {
      const after = await this.get(cursor);
      if (!after) return [];
      where.push(or(lt(jobs.createdAt, after.createdAt), and(eq(jobs.createdAt, after.createdAt), lt(jobs.id, after.id))));
    }
    return this.db
      .select()
      .from(jobs)
      .where(and(...where))
      .orderBy(desc(jobs.createdAt), desc(jobs.id))
      .limit(limit + 1);
  }

  /** Mined transactions Shield 2 reverted, newest first (GET /proof blockedTxs). */
  reverted(limit: number) {
    return this.db
      .select({ txHash: jobs.txHash, reasonCode: jobs.reasonCode, at: jobs.updatedAt })
      .from(jobs)
      .where(and(eq(jobs.status, 'reverted'), isNotNull(jobs.txHash)))
      .orderBy(desc(jobs.updatedAt))
      .limit(limit);
  }

  /** Latest jobs that reached the chain, with their broadcasting and terminal audit rows. */
  async minedTimings(limit: number) {
    const mined = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(inArray(jobs.status, ['confirmed', 'reverted']), isNotNull(jobs.txHash)))
      .orderBy(desc(jobs.updatedAt))
      .limit(limit);
    if (mined.length === 0) return [];
    const rows = await this.db
      .select({ jobId: auditLog.jobId, step: auditLog.step, at: auditLog.at })
      .from(auditLog)
      .where(and(inArray(auditLog.jobId, mined.map((m) => m.id)), inArray(auditLog.step, ['broadcasting', 'confirmed', 'reverted'])));
    return mined.map((m) => ({
      sentAt: rows.find((r) => r.jobId === m.id && r.step === 'broadcasting')?.at,
      minedAt: rows.find((r) => r.jobId === m.id && r.step !== 'broadcasting')?.at,
    }));
  }

  async get(id: string) {
    const [row] = await this.db.select().from(jobs).where(eq(jobs.id, id));
    return row;
  }

  audit(jobId: string) {
    return this.db.select().from(auditLog).where(eq(auditLog.jobId, jobId)).orderBy(asc(auditLog.id));
  }

  appendAudit(jobId: string, step: string, payload?: unknown) {
    return this.db.insert(auditLog).values({ jobId, step, payload });
  }
}
