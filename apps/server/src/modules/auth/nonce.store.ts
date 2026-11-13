import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { generateSiweNonce } from 'viem/siwe';
import { REDIS } from '../../core/redis/redis.constants';

const PREFIX = 'agentshield:siwe:nonce:';
export const NONCE_TTL_S = 300;

/** SIWE nonces in Redis: valid 5 minutes, usable once (consumed atomically), shared by every API process. */
@Injectable()
export class NonceStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async issue(): Promise<{ nonce: string; expiresAt: Date }> {
    const nonce = generateSiweNonce();
    await this.redis.set(PREFIX + nonce, '1', 'EX', NONCE_TTL_S);
    return { nonce, expiresAt: new Date(Date.now() + NONCE_TTL_S * 1000) };
  }

  /** True once per issued nonce: a replayed signature finds it gone. */
  async consume(nonce: string): Promise<boolean> {
    return (await this.redis.getdel(PREFIX + nonce)) !== null;
  }
}
