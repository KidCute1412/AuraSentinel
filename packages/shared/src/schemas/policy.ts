import { z } from 'zod';
import { Address } from '../chain';
import { Amount } from '../money';

export const TokenLimit = z.object({ token: Address, maxPerTx: Amount, dailyCap: Amount });
export type TokenLimit = z.infer<typeof TokenLimit>;

export const PolicyDto = z.object({
  agentSigner: Address,
  expiry: z.number().int().nonnegative(),
  limits: z.array(TokenLimit),
});
export type PolicyDto = z.infer<typeof PolicyDto>;
