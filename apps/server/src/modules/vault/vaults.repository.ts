import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../core/database/database.module';
import { vaults } from '../../core/database/schema';

export type VaultRow = typeof vaults.$inferSelect;

/** Sole owner of `vaults` (the registry). Addresses are stored lowercase. */
@Injectable()
export class VaultsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Idempotent: true only the first time this Safe is registered. */
  async insert(v: { safe: string; module: string; owner: string; createdAtBlock: bigint }): Promise<boolean> {
    const rows = await this.db
      .insert(vaults)
      .values({ safe: v.safe.toLowerCase(), module: v.module.toLowerCase(), owner: v.owner.toLowerCase(), createdAtBlock: v.createdAtBlock })
      .onConflictDoNothing()
      .returning({ safe: vaults.safe });
    return rows.length > 0;
  }

  async bySafe(safe: string): Promise<VaultRow | undefined> {
    const [row] = await this.db.select().from(vaults).where(eq(vaults.safe, safe.toLowerCase()));
    return row;
  }

  list(): Promise<VaultRow[]> {
    return this.db.select().from(vaults).orderBy(asc(vaults.createdAtBlock));
  }
}
