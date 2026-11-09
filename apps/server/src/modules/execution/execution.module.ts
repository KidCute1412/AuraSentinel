import { Logger, Module } from '@nestjs/common';
import type { PublicClient } from 'viem';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { FakeTxSender } from './adapters/fake.tx-sender';
import { ViemTxSender } from './adapters/viem.tx-sender';
import { createAgentWallet } from './agent-wallet';
import { TX_SENDER, type TxSenderPort } from './tx-sender.port';

/**
 * Real sender when the session key is provisioned; the fake only outside production.
 * Nest instantiates this provider once per process, so the swap and attack queues share one
 * mutex and one nonce sequence (P4).
 */
export function createTxSender(env: Env, publicClient: PublicClient): TxSenderPort {
  const log = new Logger('ExecutionModule');
  if (env.AGENT_PRIVATE_KEY) {
    const sender = new ViemTxSender(createAgentWallet(env.AGENT_PRIVATE_KEY, env.FUJI_RPC_URLS), publicClient);
    log.log(`TxSender: viem, agent ${sender.address}`);
    return sender;
  }
  if (env.NODE_ENV === 'production') throw new Error('AGENT_PRIVATE_KEY is required in production (modules/execution)');
  log.warn('TxSender: FAKE (AGENT_PRIVATE_KEY not set). Swaps are not sent on-chain.');
  return new FakeTxSender();
}

@Module({
  providers: [{ provide: TX_SENDER, inject: [ENV, PUBLIC_CLIENT], useFactory: createTxSender }],
  exports: [TX_SENDER],
})
export class ExecutionModule {}
