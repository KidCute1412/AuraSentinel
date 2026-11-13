import { Module } from '@nestjs/common';
import { RateLimiter } from '../../core/redis/rate-limiter';
import { VaultModule } from '../vault/vault.module';
import { WriteGuard } from './write.guard';

/** API-only. Controllers with public write endpoints import this and add @UseGuards(WriteGuard). */
@Module({
  imports: [VaultModule],
  providers: [RateLimiter, WriteGuard],
  exports: [WriteGuard, RateLimiter, VaultModule],
})
export class WriteGuardModule {}
