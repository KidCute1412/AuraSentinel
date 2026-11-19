import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/** API-only. Uses the global Postgres, Redis and chain clients from core. HealthService also feeds the admin preflight. */
@Module({ controllers: [HealthController], providers: [HealthService], exports: [HealthService] })
export class HealthModule {}
