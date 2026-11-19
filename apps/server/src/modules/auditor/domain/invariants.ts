import type { ReasonCode } from '@agentshield/shared';
import type { SwapIntent } from '../../../core/types';
import { failedReasons, invariantChecks } from './checks';

/** Economic outcome of a simulation that did not revert. All values are base units. */
export interface SimOutcome {
  /** Change of the Safe's tokenOut balance. Must be > 0. */
  deltaSafeTokenOut: bigint;
  /** Change of the Safe's tokenIn balance. Must be exactly -amountIn. */
  deltaSafeTokenIn: bigint;
  /** Change of the watched attacker address balance (red-team). Must be 0. */
  deltaAttacker: bigint;
  /** allowance(safe, router) for tokenIn after the swap. Must be 0. */
  allowanceAfter: bigint;
}

export interface InvariantResult {
  ok: boolean;
  /** Every broken invariant, in the order below. */
  reasons: ReasonCode[];
}

/**
 * Shield 1, step (c). A simulation that does not revert is not automatically safe: these
 * checks look at where the money went. Money may only change form, never leave the Safe.
 */
export function checkInvariants(
  intent: Pick<SwapIntent, 'amountIn'> & Partial<Pick<SwapIntent, 'tokenIn' | 'tokenOut'>>,
  sim: SimOutcome,
): InvariantResult {
  // The rule table (checks.ts) is the single source; tokens only label the values, so they may be absent here.
  const zero = '0x0000000000000000000000000000000000000000' as const;
  const rows = invariantChecks({ tokenIn: zero, tokenOut: zero, ...intent }, sim);
  const reasons = failedReasons(rows) as ReasonCode[];
  return { ok: reasons.length === 0, reasons };
}
