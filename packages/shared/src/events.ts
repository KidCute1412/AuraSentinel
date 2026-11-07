import { z } from 'zod';
import { Address, Hash } from './chain';
import { Amount } from './money';
import { Explanation } from './schemas/sim';
import { JobDto } from './schemas/job';
import { PolicyDto } from './schemas/policy';

/** SSE / Redis pub-sub event. Every event carries `vault` (D11). */
export const ServerEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('job.updated'), vault: Address, job: JobDto }),
  z.object({ type: z.literal('job.explained'), vault: Address, jobId: z.string().uuid(), explanation: Explanation }),
  z.object({
    type: z.literal('chain.swap'),
    vault: Address,
    tokenIn: Address,
    tokenOut: Address,
    amountIn: Amount,
    amountOut: Amount,
    spentToday: Amount,
    txHash: Hash,
  }),
  z.object({ type: z.literal('chain.policy'), vault: Address, policy: PolicyDto, txHash: Hash }),
  z.object({
    type: z.literal('chain.revoked'),
    vault: Address,
    txHash: Hash,
    latencyMs: z.number().nonnegative().optional(),
  }),
  z.object({ type: z.literal('vault.registered'), vault: Address, module: Address, owner: Address }),
]);
export type ServerEvent = z.infer<typeof ServerEvent>;
