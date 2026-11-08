import type { ReasonCode } from '@agentshield/shared';
import type { SwapIntent } from '../../../core/types';

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
  intent: Pick<SwapIntent, 'amountIn'>,
  sim: SimOutcome,
): InvariantResult {
  const reasons: ReasonCode[] = [];
  if (sim.deltaSafeTokenOut <= 0n) reasons.push('INVARIANT_NO_OUTPUT');
  if (sim.deltaSafeTokenIn !== -intent.amountIn) reasons.push('INVARIANT_INPUT_MISMATCH');
  if (sim.deltaAttacker !== 0n) reasons.push('INVARIANT_ATTACKER_GAINED');
  if (sim.allowanceAfter !== 0n) reasons.push('INVARIANT_ALLOWANCE_LEFT');
  return { ok: reasons.length === 0, reasons };
}
