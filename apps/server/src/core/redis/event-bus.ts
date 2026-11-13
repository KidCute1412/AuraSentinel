import { ServerEvent } from '@agentshield/shared';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { Observable } from 'rxjs';
import { REDIS } from './redis.constants';

const CHANNEL = 'agentshield:events';

/**
 * Redis pub/sub bridge between worker (publisher) and api (SSE subscriber). Events follow the
 * shared ServerEvent union and are Zod-validated on both ends.
 */
@Injectable()
export class EventBus implements OnModuleDestroy {
  private readonly log = new Logger(EventBus.name);
  private sub?: Redis;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async publish(event: ServerEvent): Promise<void> {
    await this.redis.publish(CHANNEL, JSON.stringify(ServerEvent.parse(event)));
  }

  /** Cold observable; each subscriber gets its own Redis connection. */
  stream(): Observable<ServerEvent> {
    return new Observable<ServerEvent>((subscriber) => {
      const sub = this.redis.duplicate();
      this.sub = sub;
      void sub.subscribe(CHANNEL);
      sub.on('message', (_ch, raw) => {
        try {
          subscriber.next(ServerEvent.parse(JSON.parse(raw)));
        } catch (err) {
          this.log.warn(`dropped malformed event: ${(err as Error).message}`);
        }
      });
      return () => void sub.quit();
    });
  }

  async onModuleDestroy() {
    await this.sub?.quit().catch(() => undefined);
  }
}
