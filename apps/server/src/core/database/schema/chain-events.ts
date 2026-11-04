import { bigint, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/** Owned by modules/indexer. Event log only: never policy/spend state (invariant 1). */
export const chainEvents = pgTable(
  'chain_events',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull(),
    args: jsonb('args').notNull(),
    indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('chain_events_tx_log_idx').on(t.txHash, t.logIndex)],
);

export const chainCursor = pgTable('chain_cursor', {
  id: text('id').primaryKey(), // e.g. 'policy-module'
  lastBlock: bigint('last_block', { mode: 'bigint' }).notNull(),
});
