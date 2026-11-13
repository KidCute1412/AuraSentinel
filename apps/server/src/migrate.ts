/**
 * One-shot migration runner for production (compose service `migrate`), so the runtime image
 * needs drizzle-orm only, not drizzle-kit. Applies src/core/database/migrations in order and exits.
 */
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? join(__dirname, '..', 'src', 'core', 'database', 'migrations');
  const client = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(client), { migrationsFolder });
    console.log(`migrations applied from ${migrationsFolder}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((e: unknown) => {
  console.error('migration failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
