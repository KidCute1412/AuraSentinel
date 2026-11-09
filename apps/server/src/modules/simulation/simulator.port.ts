import type { Address } from 'viem';
import type { SimResult, SwapIntent, VaultTarget } from '../../core/types';

export const SIMULATOR = Symbol('SIMULATOR');

export interface SimTarget extends VaultTarget {
  /** Address the real tx will be signed by (TxSenderPort.address). Defaults to policy.agentSigner. */
  agent?: Address;
  /** Extra addresses that must not gain tokenIn/tokenOut (red-team attacker). */
  watch?: Address[];
}

export interface SimulatorPort {
  simulate(intent: SwapIntent, target: SimTarget): Promise<SimResult>;
  /** Chain state changed (our tx mined, Kill-Switch, setPolicy): refresh the fork soon. */
  invalidate?(): void;
}
