/**
 * One-shot migration runner for production (compose service `migrate`), so the runtime image
 * needs drizzle-orm only, not drizzle-kit. Applies the migrations in order and exits.
 */
import { join } from 'node:path';
import { runMigrations } from './core/database/run-migrations';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  // dist/migrate.js runs next to dist/core/...; the SQL files live in src/ (or MIGRATIONS_DIR in the image).
  const folder = process.env.MIGRATIONS_DIR ?? join(__dirname, '..', 'src', 'core', 'database', 'migrations');
  await runMigrations(url, folder);
  console.log(`migrations applied from ${folder}`);
}

main().catch((e: unknown) => {
  console.error('migration failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
