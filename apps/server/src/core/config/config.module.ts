import { Global, Module } from '@nestjs/common';
import { parseEnv } from './env.schema';

export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => parseEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
