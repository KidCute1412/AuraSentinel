import type { Address } from 'viem';
import type { SwapIntent, VaultTarget } from '../../../core/types';
import type { RawCall, TxResult, TxSenderPort } from '../tx-sender.port';

export const FAKE_TX_HASH = `0x${'00'.repeat(32)}` as const;

/**
 * Stand-in for tests and for local runs without a session key. Swaps "succeed" with a zero hash.
 * Raw calls (red-team on-chain attacks) throw instead: a fake revert would be a fake proof.
 */
export class FakeTxSender implements TxSenderPort {
  readonly address: Address = '0x000000000000000000000000000000000000dEaD';
  readonly sent: { intent: SwapIntent; target: VaultTarget }[] = [];

  async sendSwap(intent: SwapIntent, target: VaultTarget): Promise<TxResult> {
    this.sent.push({ intent, target });
    return { txHash: FAKE_TX_HASH, status: 'success', blockNumber: 0n };
  }

  async sendRaw(_call: RawCall): Promise<TxResult> {
    throw new Error('FakeTxSender cannot send raw transactions: set AGENT_PRIVATE_KEY to run on-chain attacks');
  }
}
