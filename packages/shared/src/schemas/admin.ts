import { z } from 'zod';
import { Address } from '../chain';
import { Amount } from '../money';

/** Admin API (api.md §9). Every route is behind AdminGuard: a SIWE session from ADMIN_ADDRESSES. */

/** What the last rebalancer tick did: the processor's own return value (TickSummary). */
export const TickSummaryDto = z.object({
  at: z.string().datetime(),
  blockNumber: Amount.nullable(),
  queued: z.number().int().nonnegative(),
  skipped: z.array(z.object({ safe: Address, reason: z.string() })),
});
export type TickSummaryDto = z.infer<typeof TickSummaryDto>;

/** GET/PATCH /admin/rebalancer (#15, #16). */
export const RebalancerStatusDto = z.object({
  paused: z.boolean(),
  intervalMs: z.number().int().positive(),
  lastTickAt: z.string().datetime().nullable(),
  lastTick: TickSummaryDto.nullable().default(null),
  agent: z.object({
    address: Address,
    /** Base units (wei, 18 decimals). Display only. */
    avaxBalance: Amount,
    lowGas: z.boolean(),
    /** Swaps the balance still pays for at the current fee, or null when the fee could not be read. */
    swapsLeft: z.number().int().nonnegative().nullable().default(null),
  }),
});
export type RebalancerStatusDto = z.infer<typeof RebalancerStatusDto>;

export const UpdateRebalancerRequest = z.object({ paused: z.boolean() }).strict();
export type UpdateRebalancerRequest = z.infer<typeof UpdateRebalancerRequest>;

/** POST /admin/rebalancer/ticks (#15b): one tick queued now. */
export const RunTickResponse = z.object({ jobId: z.string() });
export type RunTickResponse = z.infer<typeof RunTickResponse>;

export const CheckStatus = z.enum(['ok', 'warn', 'fail']);
export type CheckStatus = z.infer<typeof CheckStatus>;

/** One line of the Demo Day preflight: deterministic, read from the chain and the services, never from an LLM. */
export const PreflightCheck = z.object({
  id: z.string(),
  label: z.string(),
  status: CheckStatus,
  detail: z.string(),
  /** What to do about a warn or fail; null when ok. */
  fix: z.string().nullable(),
});
export type PreflightCheck = z.infer<typeof PreflightCheck>;

/** GET /admin/preflight (#19). `status` is the worst of the checks. */
export const PreflightDto = z.object({
  status: CheckStatus,
  checkedAt: z.string().datetime(),
  checks: z.array(PreflightCheck),
  /** The demo vault's USDC left today and its daily cap (base units), for the console's headline. Null if unread. */
  demoBudget: z.object({ left: Amount, cap: Amount }).nullable(),
});
export type PreflightDto = z.infer<typeof PreflightDto>;

export const QueueName = z.enum(['swap', 'attack', 'rebalance']);
export type QueueName = z.infer<typeof QueueName>;

/** GET /admin/overview (#20). */
export const AdminOverviewDto = z.object({
  queues: z.array(
    z.object({
      name: QueueName,
      waiting: z.number().int().nonnegative(),
      active: z.number().int().nonnegative(),
      delayed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    }),
  ),
  last24h: z.object({
    total: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    reverted: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    attacks: z.number().int().nonnegative(),
    /** Median send -> receipt of recent agent transactions; null without samples. */
    medianMinedMs: z.number().int().nonnegative().nullable(),
  }),
  vaults: z.array(
    z.object({
      safe: Address,
      owner: Address,
      module: Address,
      createdAtBlock: Amount,
      isDemo: z.boolean(),
      /** Position among the vaults the rebalancer trades (1-based), or null when over REBALANCE_MAX_VAULTS or demo. */
      rebalanceSlot: z.number().int().positive().nullable(),
    }),
  ),
  maxRebalancedVaults: z.number().int().nonnegative(),
});
export type AdminOverviewDto = z.infer<typeof AdminOverviewDto>;
