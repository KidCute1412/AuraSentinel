import type { Hash } from 'viem';
import type { SwapIntent } from '../../core/types';

export const TX_SENDER = Symbol('TX_SENDER');

export interface TxSenderPort {
  /** Sends guardedSwap with the agent session key; resolves to the tx hash. */
  sendSwap(intent: SwapIntent): Promise<Hash>;
}
