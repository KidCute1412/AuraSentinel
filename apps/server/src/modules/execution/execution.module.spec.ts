import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { FakeTxSender } from './adapters/fake.tx-sender';
import { ViemTxSender } from './adapters/viem.tx-sender';
import { createTxSender, ExecutionModule } from './execution.module';
import { TX_SENDER, type TxSenderPort } from './tx-sender.port';

// Anvil dev key #1 (public, test only).
const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const env = (over: Partial<Env> = {}) => ({ NODE_ENV: 'test', FUJI_RPC_URLS: ['http://127.0.0.1:1'], ...over }) as Env;

describe('ExecutionModule', () => {
  it('gives the swap and attack consumers the same TxSender instance (one mutex, one nonce chain)', async () => {
    @Global()
    @Module({ providers: [{ provide: ENV, useValue: env({ AGENT_PRIVATE_KEY: KEY }) }, { provide: PUBLIC_CLIENT, useValue: {} }], exports: [ENV, PUBLIC_CLIENT] })
    class FakeCore {}
    @Injectable()
    class SwapConsumer {
      constructor(@Inject(TX_SENDER) readonly sender: TxSenderPort) {}
    }
    @Injectable()
    class AttackConsumer {
      constructor(@Inject(TX_SENDER) readonly sender: TxSenderPort) {}
    }
    @Module({ imports: [ExecutionModule], providers: [SwapConsumer] })
    class Auditor {}
    @Module({ imports: [ExecutionModule], providers: [AttackConsumer] })
    class Redteam {}

    const app = await Test.createTestingModule({ imports: [FakeCore, Auditor, Redteam] }).compile();
    const a = app.get(SwapConsumer).sender;
    expect(a).toBeInstanceOf(ViemTxSender);
    expect(app.get(AttackConsumer).sender).toBe(a);
    expect(a.address).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  });

  it('uses the fake without a key outside production, and refuses to boot without one in production', () => {
    expect(createTxSender(env(), {} as never)).toBeInstanceOf(FakeTxSender);
    expect(() => createTxSender(env({ NODE_ENV: 'production' }), {} as never)).toThrow('AGENT_PRIVATE_KEY is required');
  });
});
