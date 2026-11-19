import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import type { PublicClient } from 'viem';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { DRIZZLE, type Database } from '../../core/database/database.module';
import { WORKER_HEARTBEAT_KEY } from '../../core/redis/heartbeat';
import { REDIS } from '../../core/redis/redis.constants';

export type Up = 'up' | 'down';
const PROBE_TIMEOUT_MS = 2_000;

const probe = (p: Promise<unknown>): Promise<Up> =>
  Promise.race([
    p.then(() => 'up' as const),
    new Promise<Up>((resolve) => setTimeout(() => resolve('down'), PROBE_TIMEOUT_MS).unref()),
  ]).catch(() => 'down' as const);

export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  api: 'up';
  redis: Up;
  postgres: Up;
  rpc: Up;
  worker: Up;
  uptimeSec: number;
}

/**
 * Probes for /api/health and the admin preflight. Postgres and Redis are essential; RPC and worker only degrade
 * (state falls back to a stale snapshot, jobs wait in the queue). Never reveals config or secrets.
 */
@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
  ) {}

  async check(): Promise<HealthReport> {
    const [postgres, redis, rpc, worker] = await Promise.all([
      probe(this.db.execute(sql`select 1`)),
      probe(this.redis.ping()),
      probe(this.client.getBlockNumber()),
      probe(this.redis.exists(WORKER_HEARTBEAT_KEY).then((n) => (n === 1 ? n : Promise.reject(new Error('no heartbeat'))))),
    ]);
    const essentialUp = postgres === 'up' && redis === 'up';
    const status = !essentialUp ? 'down' : rpc === 'up' && worker === 'up' ? 'ok' : 'degraded';
    return { status, api: 'up', redis, postgres, rpc, worker, uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000) };
  }
}
