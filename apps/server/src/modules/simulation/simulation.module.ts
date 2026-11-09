import { Logger, Module } from '@nestjs/common';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { AnvilSimulator, createAnvilClient } from './adapters/anvil.simulator';
import { FakeSimulator } from './adapters/fake.simulator';
import { SIMULATOR, type SimulatorPort } from './simulator.port';

/**
 * Anvil once the module is deployed (POLICY_MODULE_ADDRESS set); the fake only outside
 * production, where it would silently remove a Shield 1 layer.
 */
export function createSimulator(env: Env): SimulatorPort {
  const log = new Logger('SimulationModule');
  if (env.POLICY_MODULE_ADDRESS) {
    log.log(`Simulator: Anvil fork at ${env.ANVIL_RPC_URL}`);
    return new AnvilSimulator(createAnvilClient(env.ANVIL_RPC_URL));
  }
  if (env.NODE_ENV === 'production') throw new Error('POLICY_MODULE_ADDRESS is required in production (simulation)');
  log.warn('Simulator: FAKE (POLICY_MODULE_ADDRESS not set). Swaps are not simulated.');
  return new FakeSimulator();
}

@Module({
  providers: [{ provide: SIMULATOR, inject: [ENV], useFactory: createSimulator }],
  exports: [SIMULATOR],
})
export class SimulationModule {}
