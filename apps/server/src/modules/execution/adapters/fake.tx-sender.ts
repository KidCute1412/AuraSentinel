import { Injectable } from '@nestjs/common';
import type { Hash } from 'viem';
import type { SwapIntent } from '../../../core/types';
import type { TxSenderPort } from '../tx-sender.port';

@Injectable()
export class FakeTxSender implements TxSenderPort {
  readonly sent: SwapIntent[] = [];

  async sendSwap(intent: SwapIntent): Promise<Hash> {
    this.sent.push(intent);
    return `0x${'00'.repeat(32)}`;
  }
}
