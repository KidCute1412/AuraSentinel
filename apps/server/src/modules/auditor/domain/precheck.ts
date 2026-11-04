import type { SwapIntent } from '../../../core/types';

export interface PrecheckPolicy {
  isActive: boolean;
  allowedRecipient: string;
  maxPerTx: bigint;
  dailyBudget: bigint;
  spentToday: bigint;
}

export type PrecheckResult = { ok: true } | { ok: false; reasonCode: string };

/**
 * Off-chain mirror of the on-chain gates (Shield 1). Pure and deterministic.
 * TODO(AIE): align reason codes with packages/shared/errors.ts and mirror all 5 gates.
 */
export function precheck(intent: SwapIntent, policy: PrecheckPolicy): PrecheckResult {
  if (!policy.isActive) return { ok: false, reasonCode: 'POLICY_REVOKED' };
  if (intent.recipient.toLowerCase() !== policy.allowedRecipient.toLowerCase()) {
    return { ok: false, reasonCode: 'RECIPIENT_NOT_ALLOWED' };
  }
  if (intent.amountIn > policy.maxPerTx) return { ok: false, reasonCode: 'EXCEEDS_MAX_PER_TX' };
  if (policy.spentToday + intent.amountIn > policy.dailyBudget) {
    return { ok: false, reasonCode: 'EXCEEDS_DAILY_BUDGET' };
  }
  return { ok: true };
}
