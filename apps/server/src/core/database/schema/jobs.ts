import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const jobStatus = pgEnum('job_status', [
  'queued',
  'prechecking',
  'simulating',
  'broadcasting',
  'confirmed',
  'rejected',
  'reverted',
  'failed',
]);

/** Owned by modules/jobs. Money fields are base-unit strings (invariant 4). */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Safe address (lowercase). Default only covers rows created before multi-vault (A6). */
    vault: text('vault').notNull().default('0x0000000000000000000000000000000000000000'),
    kind: text('kind').notNull(), // 'rebalance' | 'attack:<scenario>'
    status: jobStatus('status').notNull().default('queued'),
    intent: jsonb('intent'),
    /** Shield 1 step (a): { ok, reasons }. Null until precheck ran. */
    precheck: jsonb('precheck'),
    simResult: jsonb('sim_result'),
    explanation: jsonb('explanation'),
    reasonCode: text('reason_code'),
    txHash: text('tx_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('jobs_created_at_idx').on(t.createdAt), index('jobs_vault_created_at_idx').on(t.vault, t.createdAt)],
);
