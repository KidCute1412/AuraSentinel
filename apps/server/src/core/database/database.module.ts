import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');
const PG_CLIENT = Symbol('PG_CLIENT');

export type Database = PostgresJsDatabase<typeof schema>;

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(PG_CLIENT) private readonly client: postgres.Sql) {}
  async onApplicationShutdown() {
    await this.client.end({ timeout: 5 });
  }
}

@Global()
@Module({
  providers: [
    { provide: PG_CLIENT, inject: [ENV], useFactory: (env: Env) => postgres(env.DATABASE_URL) },
    {
      provide: DRIZZLE,
      inject: [PG_CLIENT],
      useFactory: (client: postgres.Sql): Database => drizzle(client, { schema }),
    },
    DatabaseShutdown,
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
