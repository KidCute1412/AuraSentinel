import { z } from 'zod';
import { Address, Hash } from '../chain';
import { Amount } from '../money';
import { Explanation, SimResult } from './sim';
import { JobOrigin, SwapIntent } from './intent';

/** D1 state machine. Terminal: rejected, confirmed, reverted, failed. */
export const JobStatus = z.enum([
  'queued',
  'prechecking',
  'simulating',
  'broadcasting',
  'confirmed',
  'rejected',
  'reverted',
  'failed',
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const JOB_TERMINAL_STATUSES: readonly JobStatus[] = ['rejected', 'confirmed', 'reverted', 'failed'];

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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type JobDto = z.infer<typeof JobDto>;

export const AuditEntry = z.object({
  shield: z.enum(['precheck', 'simulation', 'invariant', 'onchain']),
  result: z.enum(['pass', 'fail']),
  reason: z.string().nullable(),
  ts: z.string().datetime(),
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
