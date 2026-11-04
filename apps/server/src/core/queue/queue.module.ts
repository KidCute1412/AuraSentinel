import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';

/** BullMQ connection only. Each feature module registers its own queues via BullModule.registerQueue. */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        connection: { url: env.REDIS_URL },
        defaultJobOptions: { removeOnComplete: 200, removeOnFail: 500, attempts: 1 },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
