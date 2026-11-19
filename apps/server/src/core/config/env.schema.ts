import { existsSync } from 'node:fs';
import { FUJI_DEPLOYMENT, FUJI_FACTORY_BLOCK, FUJI_PUBLIC_RPC_URLS } from '@agentshield/shared';
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

  /**
   * Any OpenAI-compatible chat endpoint (self-hosted vLLM, Ollama...), e.g. http://127.0.0.1:18449/v1. When set it
   * is used instead of Gemini and LLM_MODEL is required. The host must be able to reach it (an SSH tunnel in dev).
   */
  LLM_BASE_URL: z.string().url().optional(),
  /** Sent as `Authorization: Bearer`. Unset: no header. */
  LLM_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  /** Max calls per minute to LLM_BASE_URL (button spam must not load the box); above it the explainer uses the template. */
  LLM_RPM: z.coerce.number().int().positive().default(60),

  /** Contract test summary written by the L5 CI job; GET /proof reads it. */
  PROOF_TESTS_FILE: z.string().default('../../packages/contracts/proof/tests.json'),

  // Abuse protection on write endpoints (A9). 0 disables a limit (e2e tests).
  /** Writes allowed per client IP per WRITE_IP_WINDOW_MS. */
  WRITE_LIMIT_PER_IP: z.coerce.number().int().nonnegative().default(10),
  WRITE_IP_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  /** Minimum gap between two writes to the same (vault, endpoint). */
  WRITE_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(2_000),
  /** Minimum gap between two writes from anyone to the public demo vault (D12: guests share it). */
  DEMO_WRITE_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(5_000),
  /** Refuse new jobs (503 AGENT_LOW_GAS) below this agent balance, in wei. Default 0.02 AVAX (~1 swap at 700k gas). */
  AGENT_MIN_GAS_WEI: z.coerce.bigint().nonnegative().default(20_000_000_000_000_000n),
  /**
   * Shared with the web's Vercel proxy (apps/web/api/proxy.ts). When a request carries it, the client IP that proxy
   * forwards is trusted (per-IP write limits), and the request counts as HTTPS. Unset: the header is ignored.
   */
  WEB_PROXY_SECRET: z.string().min(32).optional(),
  /** Browser origins allowed by CORS, comma separated. Unset: no CORS (prod is same-origin behind nginx). */
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])),

  // SIWE sessions (A9, D12): only owners and admins sign in; guests use the demo vault without one.
  /** HMAC key for session JWTs (>= 32 chars). Required in production; dev falls back to a per-process random key. */
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_TTL_S: z.coerce.number().int().positive().default(12 * 3600),
  /** Domains a SIWE message may be issued for (host[:port]). Unset: the request Host. Dev behind Vite: localhost:5173. */
  SIWE_DOMAINS: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [])),
  /** Wallets with the admin role (Demo mode drawer, Bull Board). Comma separated. */
  ADMIN_ADDRESSES: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [])),

  REBALANCE_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  /** Most vaults (non-demo, active) the shared agent rebalances, oldest first; its gas pays for every swap. 0 = no cap. */
  REBALANCE_MAX_VAULTS: z.coerce.number().int().nonnegative().default(5),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Public values every deployment shares, so .env files hold only secrets and per-deployment settings. Applied
 * outside tests only: a test that forgets an address must not silently talk to the real Fuji contracts.
 */
const FUJI_DEFAULTS: Record<string, string> = {
  FUJI_RPC_URLS: FUJI_PUBLIC_RPC_URLS.join(','),
  SAFE_ADDRESS: FUJI_DEPLOYMENT.publicSafe,
  POLICY_MODULE_ADDRESS: FUJI_DEPLOYMENT.publicModule,
  TOKEN_A_ADDRESS: FUJI_DEPLOYMENT.usdc,
  TOKEN_B_ADDRESS: FUJI_DEPLOYMENT.wavax,
  FACTORY_ADDRESS: FUJI_DEPLOYMENT.factory,
  INDEXER_START_BLOCK: String(FUJI_FACTORY_BLOCK),
};
/** Local dev: the ports infra/docker-compose.yml publishes. Production gets these from its compose file. */
const DEV_DEFAULTS: Record<string, string> = {
  DATABASE_URL: 'postgres://agentshield:agentshield@localhost:55432/agentshield',
  REDIS_URL: 'redis://localhost:56379',
  // The web runs on Vite and proxies /api here with changeOrigin, so the request Host is not what the browser shows.
  SIWE_DOMAINS: 'localhost:5173',
};

export function defaultsFor(nodeEnv: string | undefined): Record<string, string> {
  if (nodeEnv === 'test') return {};
  return nodeEnv === 'production' ? FUJI_DEFAULTS : { ...FUJI_DEFAULTS, ...DEV_DEFAULTS };
}

export function parseEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  // Local dev: load apps/server/.env if present (real env vars always win).
  if (raw === process.env && existsSync('.env')) process.loadEnvFile('.env');
  // `KEY=` in a .env file means "unset", not an empty string.
  const set = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
  const cleaned = { ...defaultsFor(set.NODE_ENV ?? 'development'), ...set };
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  if (result.data.NODE_ENV === 'production' && !result.data.SESSION_SECRET) {
    throw new Error('Invalid environment:\n  - SESSION_SECRET: required in production (32+ chars)');
  }
  if (result.data.LLM_BASE_URL && !result.data.LLM_MODEL) {
    throw new Error('Invalid environment:\n  - LLM_MODEL: required when LLM_BASE_URL is set');
  }
  return result.data;
}
