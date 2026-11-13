import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/** Folder of the SQL migrations in the source tree (the Docker image sets MIGRATIONS_DIR instead). */
export const MIGRATIONS_DIR = join(__dirname, 'migrations');

/** Applies pending migrations in order with drizzle-orm's migrator (no drizzle-kit needed). */
export async function runMigrations(url: string, migrationsFolder = MIGRATIONS_DIR): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end({ timeout: 5 });
  }
}
