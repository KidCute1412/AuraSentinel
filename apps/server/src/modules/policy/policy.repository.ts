import { Inject, Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../core/database/database.module';
import { policySnapshots } from '../../core/database/schema';

/** Sole owner of `policy_snapshots`. */
@Injectable()
export class PolicyRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  save(policy: unknown) {
    return this.db.insert(policySnapshots).values({ policy });
  }

  async latest() {
    const [row] = await this.db.select().from(policySnapshots).orderBy(desc(policySnapshots.takenAt)).limit(1);
    return row?.policy;
  }
}
