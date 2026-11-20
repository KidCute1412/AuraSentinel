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
  /** Only when success: every ERC-20 Transfer the receipt logged (what really moved, not a simulation). */
  transfers?: Erc20Transfer[];
}

/**
 * A dry run of a raw call (eth_call from the session key on the latest block). `reverted: false` means the chain would
 * have ACCEPTED it, so a red-team run must not send it. Infra errors are thrown, never reported as a result.
 */
export type RawCallResult = { reverted: false } | { reverted: true; revertReason: ReasonCode };

export interface Erc20Transfer {
  token: Address;
  from: Address;
  to: Address;
  value: bigint;
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
  /** eth_call of the same call from the session key: would the chain refuse it? Signs nothing, sends nothing. */
  callRaw(call: RawCall): Promise<RawCallResult>;
}
