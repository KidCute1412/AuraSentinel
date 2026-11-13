import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from './redis.constants';

export interface LimitResult {
  ok: boolean;
  /** When ok is false: how long until the caller may try again. */
  retryAfterMs: number;
}

const PREFIX = 'agentshield:limit:';

/**
 * Redis-backed limits for the write endpoints (A9). Redis rather than memory so the counters
 * survive an API restart and hold across several API processes. Each operation is atomic.
 */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** At most `max` hits per fixed window of `windowMs` for this key. */
  async window(key: string, max: number, windowMs: number): Promise<LimitResult> {
    const k = PREFIX + key;
    const res = await this.redis.multi().set(k, 0, 'PX', windowMs, 'NX').incr(k).pttl(k).exec();
    const count = Number(res?.[1]?.[1] ?? 0);
    const ttl = Number(res?.[2]?.[1] ?? windowMs);
    return count <= max ? { ok: true, retryAfterMs: 0 } : { ok: false, retryAfterMs: Math.max(ttl, 0) };
  }

  /** At most one hit per `ms` for this key. */
  async cooldown(key: string, ms: number): Promise<LimitResult> {
    const k = PREFIX + key;
    const set = await this.redis.set(k, '1', 'PX', ms, 'NX');
    if (set === 'OK') return { ok: true, retryAfterMs: 0 };
    return { ok: false, retryAfterMs: Math.max(await this.redis.pttl(k), 0) };
  }
}
