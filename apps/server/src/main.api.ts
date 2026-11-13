import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ApiAppModule } from './api-app.module';
import { ENV } from './core/config/config.module';
import type { Env } from './core/config/env.schema';
import { ProblemFilter } from './core/http/problem.filter';

async function bootstrap() {
  const app = await NestFactory.create(ApiAppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // api.md §1: every route under /api/v1 (the SPA owns the bare paths).
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemFilter());
  app.enableCors();
  app.enableShutdownHooks();
  const env = app.get<Env>(ENV);
  await app.listen(env.API_PORT);
}

void bootstrap();
