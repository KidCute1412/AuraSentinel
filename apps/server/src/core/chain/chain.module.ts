import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { createFujiPublicClient } from './public-client';

export const PUBLIC_CLIENT = Symbol('PUBLIC_CLIENT');

// TODO(FS1/FS2): add contracts.ts (getContract from @agentshield/shared ABIs) once packages/shared exists.
@Global()
@Module({
  providers: [{ provide: PUBLIC_CLIENT, inject: [ENV], useFactory: (env: Env) => createFujiPublicClient(env.FUJI_RPC_URLS) }],
  exports: [PUBLIC_CLIENT],
})
export class ChainModule {}
