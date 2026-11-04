import { Inject, Injectable } from '@nestjs/common';
import type { PublicClient } from 'viem';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';

@Injectable()
export class VaultService {
  constructor(@Inject(PUBLIC_CLIENT) private readonly client: PublicClient) {}

  /**
   * Read-only vault state straight from chain (balances of the Safe, spentToday, isActive).
   * TODO(FS2): read via shared ABIs; cache ~1s. Serialize bigint as strings.
   */
  async getState() {
    const blockNumber = await this.client.getBlockNumber();
    return { blockNumber: blockNumber.toString() };
  }
}
