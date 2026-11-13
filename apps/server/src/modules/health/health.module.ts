import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/** API-only. Uses the global Postgres, Redis and chain clients from core. */
@Module({ controllers: [HealthController] })
export class HealthModule {}
