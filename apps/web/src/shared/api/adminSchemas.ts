import { Address, Amount } from "@agentshield/shared";
import { z } from "zod";

/**
 * GET/PATCH /admin/rebalancer (api.md #15, #16). Kept in the web app for now because
 * packages/shared has no admin schema yet; move it there when A9 adds the admin API.
 */
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
