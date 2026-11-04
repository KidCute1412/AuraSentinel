import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../core/database/database.module';
import { auditLog, jobs } from '../../core/database/schema';

type JobPatch = Partial<Omit<typeof jobs.$inferInsert, 'id' | 'createdAt'>>;

/** Sole owner of `jobs` and `audit_log` tables. */
@Injectable()
export class JobsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(kind: string, intent?: unknown) {
    const [row] = await this.db.insert(jobs).values({ kind, intent }).returning();
    return row;
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

  async get(id: string) {
    const [row] = await this.db.select().from(jobs).where(eq(jobs.id, id));
    return row;
  }

  appendAudit(jobId: string, step: string, payload?: unknown) {
    return this.db.insert(auditLog).values({ jobId, step, payload });
  }
}
