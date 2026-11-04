import { Inject, Injectable } from '@nestjs/common';
import type { Hash } from 'viem';
import { ENV } from '../../../core/config/config.module';
import type { Env } from '../../../core/config/env.schema';
import type { SwapIntent } from '../../../core/types';
import { createAgentWallet } from '../agent-wallet';
import type { TxSenderPort } from '../tx-sender.port';

/** TODO(FS2): mutex + manual gas + guardedSwap call via shared ABI; decode reverts in revert-decoder.ts. */
@Injectable()
export class ViemTxSender implements TxSenderPort {
  private readonly wallet;

  constructor(@Inject(ENV) env: Env) {
    if (!env.AGENT_PRIVATE_KEY) throw new Error('AGENT_PRIVATE_KEY is required by modules/execution');
    this.wallet = createAgentWallet(env.AGENT_PRIVATE_KEY, env.FUJI_RPC_URLS);
  }

  async sendSwap(_intent: SwapIntent): Promise<Hash> {
    void this.wallet;
    throw new Error('ViemTxSender.sendSwap not implemented');
  }
}
