import { jsonb, pgTable, serial, timestamp } from 'drizzle-orm/pg-core';

/** Owned by modules/policy. Fallback cache only when RPC is down; chain stays the source of truth. */
export const policySnapshots = pgTable('policy_snapshots', {
  id: serial('id').primaryKey(),
  policy: jsonb('policy').notNull(),
  takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
});
