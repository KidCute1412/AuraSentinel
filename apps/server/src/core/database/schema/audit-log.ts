import { index, jsonb, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Owned by modules/jobs. Append-only trail of every state transition. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: serial('id').primaryKey(),
    jobId: uuid('job_id').notNull(),
    step: text('step').notNull(),
    payload: jsonb('payload'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_job_idx').on(t.jobId)],
);
