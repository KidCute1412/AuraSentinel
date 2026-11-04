import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../core/database/database.module';
import { chainCursor, chainEvents } from '../../core/database/schema';

/** Sole owner of `chain_events` and `chain_cursor`. */
@Injectable()
export class IndexerRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getCursor(id: string): Promise<bigint | undefined> {
    const [row] = await this.db.select().from(chainCursor).where(eq(chainCursor.id, id));
    return row?.lastBlock;
  }

  async setCursor(id: string, lastBlock: bigint) {
    await this.db
      .insert(chainCursor)
      .values({ id, lastBlock })
      .onConflictDoUpdate({ target: chainCursor.id, set: { lastBlock } });
  }

  insertEvent(e: typeof chainEvents.$inferInsert) {
    return this.db.insert(chainEvents).values(e).onConflictDoNothing();
  }
}
