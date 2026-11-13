import { existsSync } from 'node:fs';
import { z } from 'zod';

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'invalid address')
  .transform((v) => v as `0x${string}`);
const hexKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'invalid private key')
  .transform((v) => v as `0x${string}`);

/** Fail-fast env validation. NEVER add an owner key here (invariant 5). */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  /** Comma separated, first = primary, rest = viem fallback transports. */
  FUJI_RPC_URLS: z
    .string()
    .min(1)
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  ANVIL_RPC_URL: z.string().url().default('http://127.0.0.1:8545'),

  /** Session key only. Read exclusively by modules/execution. */
  AGENT_PRIVATE_KEY: hexKey.optional(),

  SAFE_ADDRESS: address.optional(),
  POLICY_MODULE_ADDRESS: address.optional(),
  TOKEN_A_ADDRESS: address.optional(),
  TOKEN_B_ADDRESS: address.optional(),
  /** AgentShieldFactory: the indexer reads ModuleDeployed from it to fill the vault registry. */
  FACTORY_ADDRESS: address.optional(),
  /** First block to index when there is no cursor yet (factory deploy block). Unset: start at the head. */
  INDEXER_START_BLOCK: z.coerce.bigint().nonnegative().optional(),
  INDEXER_POLL_MS: z.coerce.number().int().positive().default(1_000),
  /** Blocks per eth_getLogs call. The public Fuji RPC allows 100; a dedicated RPC allows more. */
  INDEXER_MAX_SPAN: z.coerce.bigint().positive().default(100n),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  EXPLAINER_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  /** Max Gemini calls per minute; above it the explainer uses the template (free tier is ~10 RPM). */
  GEMINI_RPM: z.coerce.number().int().positive().default(10),

  /** Contract test summary written by the L5 CI job; GET /proof reads it. */
  PROOF_TESTS_FILE: z.string().default('../../packages/contracts/proof/tests.json'),

  REBALANCE_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  // Local dev: load apps/server/.env if present (real env vars always win).
  if (raw === process.env && existsSync('.env')) process.loadEnvFile('.env');
  // `KEY=` in a .env file means "unset", not an empty string.
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return result.data;
}
