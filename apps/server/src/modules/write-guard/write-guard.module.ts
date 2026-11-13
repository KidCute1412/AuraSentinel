import { Module } from '@nestjs/common';
import { RateLimiter } from '../../core/redis/rate-limiter';
import { AuthModule } from '../auth/auth.module';
import { VaultModule } from '../vault/vault.module';
import { WriteGuard } from './write.guard';

/** API-only. Controllers with public write endpoints import this and add @UseGuards(WriteGuard). */
@Module({
  imports: [VaultModule, AuthModule],
  providers: [RateLimiter, WriteGuard],
  exports: [WriteGuard, RateLimiter, VaultModule, AuthModule],
})
export class WriteGuardModule {}
