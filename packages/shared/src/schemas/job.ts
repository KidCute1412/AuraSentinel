import { z } from 'zod';
import { Address, Hash } from '../chain';
import { Amount } from '../money';
import { AgentPlan } from './agent';
import { Explanation, SimResult } from './sim';
import { JobOrigin, SwapIntent } from './intent';

/**
 * D1 state machine. Terminal: rejected, confirmed, reverted, failed, held.
 * `held` = a red-team plan the shields would have let through (it is inside the owner's policy), stopped before
 * broadcast on purpose: red-team runs never send a transaction that could succeed.
 */
export const JobStatus = z.enum([
  'queued',
  'prechecking',
  'simulating',
  'broadcasting',
  'confirmed',
  'rejected',
  'reverted',
  'failed',
  'held',
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const JOB_TERMINAL_STATUSES: readonly JobStatus[] = ['rejected', 'confirmed', 'reverted', 'failed', 'held'];

export const JobKind = z.enum(['swap', 'attack']);
export type JobKind = z.infer<typeof JobKind>;

export const JobDto = z.object({
  id: z.string().uuid(),
  vault: Address,
  kind: JobKind,
  origin: JobOrigin,
  status: JobStatus,
  intent: SwapIntent.nullable(),
  txHash: Hash.nullable(),
  explorerUrl: z.string().nullable(),
  revertError: z.string().nullable(),
  reasonCode: z.string().nullable(),
  explanation: Explanation.nullable(),
  /** Hijacked Agent runs only: what the agent's brain decided after reading the poisoned feed. */
  agentPlan: AgentPlan.nullish(),
  /**
   * Red-team jobs: which attack ("over-withdraw", ..., "prompt-injection"); null for trades. A plain string here, not
   * the AttackScenario enum, so job.ts and attack.ts do not import each other.
   */
  scenario: z.string().max(40).nullish(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type JobDto = z.infer<typeof JobDto>;

/**
 * A value a rule looked at, typed so the web formats it (P5: money stays base units here). `amount` may be signed
 * (a simulated balance delta).
 */
export const CheckValue = z.discriminatedUnion('type', [
  z.object({ type: z.literal('amount'), amount: z.string().regex(/^-?(0|[1-9]\d*)$/), token: Address, symbol: z.string(), decimals: z.number().int().min(0).max(36) }),
  z.object({ type: z.literal('address'), value: Address }),
  z.object({ type: z.literal('bool'), value: z.boolean() }),
  z.object({ type: z.literal('time'), unix: z.number().int().nonnegative() }),
  z.object({ type: z.literal('text'), value: z.string().max(200) }),
]);
export type CheckValue = z.infer<typeof CheckValue>;

/** One rule a shield checked: what the job had (`actual`) against what the rule allows (`limit`). */
export const CheckRow = z.object({
  id: z.string(),
  pass: z.boolean(),
  /** The error this rule raises when it fails (precheck reason, invariant code, revert name); null when it passed. */
  reasonCode: z.string().nullable(),
  actual: CheckValue.nullable(),
  limit: CheckValue.nullable(),
});
export type CheckRow = z.infer<typeof CheckRow>;

export const AuditEntry = z.object({
  shield: z.enum(['precheck', 'simulation', 'invariant', 'onchain']),
  result: z.enum(['pass', 'fail']),
  reason: z.string().nullable(),
  ts: z.string().datetime(),
  /** The rules behind the result, in the order they were checked. Empty for jobs recorded before this existed. */
  checks: z.array(CheckRow).default([]),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

/** GET /jobs/{id}: JobDto plus pipeline detail. */
export const JobDetailDto = JobDto.extend({
  precheck: z.object({ ok: z.boolean(), reasons: z.array(z.string()) }).nullable(),
  sim: SimResult.nullable(),
  audit: z.array(AuditEntry),
});
export type JobDetailDto = z.infer<typeof JobDetailDto>;

export const JobListDto = z.object({ items: z.array(JobDto), nextCursor: z.string().nullable() });
export type JobListDto = z.infer<typeof JobListDto>;

/** POST /vaults/{safe}/jobs. Discriminated on kind so it can grow. */
export const CreateJobRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rebalance'), amountIn: Amount.refine((a) => a !== '0', 'amountIn must be > 0') }),
]);
export type CreateJobRequest = z.infer<typeof CreateJobRequest>;

export const CreateJobResponse = z.object({ jobId: z.string().uuid(), status: JobStatus });
export type CreateJobResponse = z.infer<typeof CreateJobResponse>;
