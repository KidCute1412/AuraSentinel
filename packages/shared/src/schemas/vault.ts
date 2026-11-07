import { z } from 'zod';
import { Address } from '../chain';
import { Amount } from '../money';
import { PolicyDto } from './policy';

export const VaultSummaryDto = z.object({
  safe: Address,
  module: Address,
  owner: Address,
  isDemo: z.boolean(),
  createdAtBlock: Amount,
});
export type VaultSummaryDto = z.infer<typeof VaultSummaryDto>;

export const VaultListDto = z.object({ vaults: z.array(VaultSummaryDto) });
export type VaultListDto = z.infer<typeof VaultListDto>;

export const VaultDto = z.object({
  safe: Address,
  module: Address,
  owner: Address,
  agent: Address,
  isDemo: z.boolean(),
  registered: z.boolean(),
  explorer: z.string(),
});
export type VaultDto = z.infer<typeof VaultDto>;

export const RegisterVaultResponse = z.object({ safe: Address, registered: z.literal(true) });
export type RegisterVaultResponse = z.infer<typeof RegisterVaultResponse>;

export const StateDto = z.object({
  safe: Address,
  blockNumber: Amount,
  isActive: z.boolean(),
  policyEpoch: z.number().int().nonnegative(),
  policy: PolicyDto,
  spentToday: z.array(z.object({ token: Address, dayId: z.number().int(), amount: Amount })),
  balances: z.array(
    z.object({ token: Address, symbol: z.string(), decimals: z.number().int().min(0).max(36), amount: Amount }),
  ),
  /** Display only (0-100). */
  budgetUsedPct: z.number().min(0).max(100),
  stale: z.boolean(),
});
export type StateDto = z.infer<typeof StateDto>;
