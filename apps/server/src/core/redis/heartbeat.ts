import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from './redis.constants';

export const WORKER_HEARTBEAT_KEY = 'agentshield:worker:heartbeat';
const EVERY_MS = 5_000;
const TTL_S = 15;

/** Worker-only: refreshes a short-lived Redis key so the API health check can tell the worker is alive. */
@Injectable()
export class WorkerHeartbeat implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onModuleInit() {
    const beat = () => void this.redis.set(WORKER_HEARTBEAT_KEY, Date.now().toString(), 'EX', TTL_S).catch(() => undefined);
    beat();
    this.timer = setInterval(beat, EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
