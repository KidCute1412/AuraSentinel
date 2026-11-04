import { Module } from '@nestjs/common';
import { ChainModule } from './chain/chain.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AppLoggerModule } from './logger/logger.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';

/** Shared infrastructure for both processes. All children are @Global. */
@Module({
  imports: [ConfigModule, AppLoggerModule, DatabaseModule, RedisModule, QueueModule, ChainModule],
})
export class CoreModule {}
