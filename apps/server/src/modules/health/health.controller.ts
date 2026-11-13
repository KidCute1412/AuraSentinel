import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import Redis from 'ioredis';
import type { PublicClient } from 'viem';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { DRIZZLE, type Database } from '../../core/database/database.module';
import { WORKER_HEARTBEAT_KEY } from '../../core/redis/heartbeat';
import { REDIS } from '../../core/redis/redis.constants';

type Up = 'up' | 'down';
const PROBE_TIMEOUT_MS = 2_000;

const probe = (p: Promise<unknown>): Promise<Up> =>
  Promise.race([
    p.then(() => 'up' as const),
    new Promise<Up>((resolve) => setTimeout(() => resolve('down'), PROBE_TIMEOUT_MS).unref()),
  ]).catch(() => 'down' as const);

/**
 * GET /api/health (api.md #18, unversioned): Docker healthcheck, smoke test, uptime.
 * Postgres and Redis are essential (503 when down). RPC and worker only degrade: state falls
 * back to a stale snapshot and jobs wait in the queue. Never reveals config or secrets.
 */
@Controller('api/health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
  ) {}

  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    const [postgres, redis, rpc, worker] = await Promise.all([
      probe(this.db.execute(sql`select 1`)),
      probe(this.redis.ping()),
      probe(this.client.getBlockNumber()),
      probe(this.redis.exists(WORKER_HEARTBEAT_KEY).then((n) => (n === 1 ? n : Promise.reject(new Error('no heartbeat'))))),
    ]);
    const essentialUp = postgres === 'up' && redis === 'up';
    const status = !essentialUp ? 'down' : rpc === 'up' && worker === 'up' ? 'ok' : 'degraded';
    res.status(essentialUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status, api: 'up', redis, postgres, rpc, worker, uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000) };
  }
}
