import { z } from 'zod';

/** GET /proof (api.md #14). Public evidence for judges; every number is measured, never invented. */
export const ProofDto = z.object({
  network: z.object({ name: z.string(), chainId: z.number().int() }),
  contracts: z.array(
    z.object({ name: z.string(), address: z.string(), verified: z.boolean(), explorerUrl: z.string().optional() }),
  ),
  /** Send -> receipt of the agent's own transactions on Fuji, in ms. samples = 0 when none yet. */
  finality: z.object({
    samples: z.number().int().nonnegative(),
    avgMs: z.number().nonnegative(),
    minMs: z.number().nonnegative(),
    maxMs: z.number().nonnegative(),
    recentMs: z.array(z.number().nonnegative()).optional(),
  }),
  /** From the CI artifact of the contract test suite (L5). passed=false, slither "not run" until it exists. */
  tests: z.object({
    fuzzRuns: z.number().int().nonnegative(),
    invariants: z.array(z.string()),
    passed: z.boolean(),
    slither: z.string(),
  }),
  /** Transactions Shield 2 reverted on chain, newest first. */
  blockedTxs: z.array(
    z.object({ txHash: z.string(), error: z.string(), at: z.string(), explorerUrl: z.string().optional() }),
  ),
});
export type ProofDto = z.infer<typeof ProofDto>;
