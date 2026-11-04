import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ApiAppModule } from './api-app.module';
import { ENV } from './core/config/config.module';
import type { Env } from './core/config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(ApiAppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors();
  app.enableShutdownHooks();
  const env = app.get<Env>(ENV);
  await app.listen(env.API_PORT);
}

void bootstrap();
