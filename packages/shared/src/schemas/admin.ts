import { z } from 'zod';
import { Address } from '../chain';
import { Amount } from '../money';

/** GET/PATCH /admin/rebalancer (api.md #15, #16). Admin only. */
export const RebalancerStatusDto = z.object({
  paused: z.boolean(),
  intervalMs: z.number().int().positive(),
  lastTickAt: z.string().datetime().nullable(),
  agent: z.object({
    address: Address,
    /** Base units (wei, 18 decimals). Display only. */
    avaxBalance: Amount,
    lowGas: z.boolean(),
  }),
});
export type RebalancerStatusDto = z.infer<typeof RebalancerStatusDto>;

export const UpdateRebalancerRequest = z.object({ paused: z.boolean() }).strict();
export type UpdateRebalancerRequest = z.infer<typeof UpdateRebalancerRequest>;
