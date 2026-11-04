import { Module } from '@nestjs/common';
import { LoggerModule as PinoModule } from 'nestjs-pino';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';

@Module({
  imports: [
    PinoModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          // never log secrets
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          transport: env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
        },
      }),
    }),
  ],
})
export class AppLoggerModule {}
