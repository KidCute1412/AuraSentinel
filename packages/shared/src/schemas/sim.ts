import { z } from 'zod';
import { Amount, SignedAmount } from '../money';

/** Result of the Anvil simulation (api.md GET /jobs/{id}). Money as strings. */
export const SimResult = z.object({
  ok: z.boolean(),
  deltaSafeTokenOut: SignedAmount,
  deltaSafeTokenIn: SignedAmount,
  attackerBalance: Amount,
  allowanceAfter: Amount,
  revertReason: z.string().optional(),
});
export type SimResult = z.infer<typeof SimResult>;

export const Explanation = z.object({
  verdict: z.enum(['safe', 'blocked']),
  /** Display only (0-100), deterministic from bigint; never used to compute money. */
  budgetUsedPct: z.number().min(0).max(100),
  /** The explanation shown to the owner. Historical name: the LLM writes it in English (the UI language) now. */
  messageVi: z.string().max(700),
  source: z.enum(['llm', 'template']),
});
export type Explanation = z.infer<typeof Explanation>;
