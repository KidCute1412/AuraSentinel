import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/core/database/schema/index.ts',
  out: './src/core/database/migrations',
  // Same local default as the server (DEV_DEFAULTS in src/core/config/env.schema.ts): infra/docker-compose.yml ports.
  dbCredentials: { url: process.env.DATABASE_URL || 'postgres://agentshield:agentshield@localhost:55432/agentshield' },
});
