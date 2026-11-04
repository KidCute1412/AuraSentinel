import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { EventBus } from './event-bus';
import { REDIS } from './redis.constants';

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onApplicationShutdown() {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    { provide: REDIS, inject: [ENV], useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) },
    EventBus,
    RedisShutdown,
  ],
  exports: [REDIS, EventBus],
})
export class RedisModule {}
