import { bigint, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Owned by modules/vault. Registry only (P1): which Safe is guarded by which module, filled by
 * the indexer from ModuleDeployed. Never policy, limits or spend: those are read from the chain.
 * Addresses are stored lowercase.
 */
export const vaults = pgTable(
  'vaults',
  {
    safe: text('safe').primaryKey(),
    module: text('module').notNull(),
    owner: text('owner').notNull(),
    createdAtBlock: bigint('created_at_block', { mode: 'bigint' }).notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('vaults_module_idx').on(t.module)],
);
