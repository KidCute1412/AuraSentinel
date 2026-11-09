import type { ReasonCode } from '@agentshield/shared';
import type { Address, Hash, Hex } from 'viem';
import type { SwapIntent, VaultTarget } from '../../core/types';

export const TX_SENDER = Symbol('TX_SENDER');

/** A raw transaction for the session key to sign (red-team on-chain attacks). Manual gas, always. */
export interface RawCall {
  to: Address;
  data: Hex;
  gas: bigint;
}

/**
 * Outcome of a mined transaction. A revert is a result, not an error (invariant 7): it is mined,
 * has a hash for Snowtrace, and is never retried. Errors thrown by the port are infra failures.
 */
export interface TxResult {
  txHash: Hash;
  status: 'success' | 'reverted';
  blockNumber: bigint;
  /** Only when reverted: decoded reason (UNKNOWN_REVERT if the data could not be recovered). */
  revertReason?: ReasonCode;
  revertData?: Hex;
}

/**
 * The single path that signs with the agent session key (P4, P5). Auditor (swap queue) and
 * RedTeam (attack queue) share ONE instance, so one mutex orders every nonce.
 */
export interface TxSenderPort {
  /** Public address of the session key (the simulator impersonates it). Never the key itself. */
  readonly address: Address;
  /** Sends executeGuardedSwap. `intent.recipient` is not sent: the module hard-codes the Safe (D2). */
  sendSwap(intent: SwapIntent, target: VaultTarget): Promise<TxResult>;
  /** Sends a pre-built call with manual gas so a revert is mined, not caught by estimation. */
  sendRaw(call: RawCall): Promise<TxResult>;
}
