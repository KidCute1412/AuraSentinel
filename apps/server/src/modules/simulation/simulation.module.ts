import { Module } from '@nestjs/common';
import { AnvilSimulator } from './adapters/anvil.simulator';
import { FakeSimulator } from './adapters/fake.simulator';
import { SIMULATOR } from './simulator.port';

@Module({
  providers: [
    // Swap to AnvilSimulator once the contracts are deployed on the fork.
    { provide: SIMULATOR, useClass: FakeSimulator },
    AnvilSimulator,
  ],
  exports: [SIMULATOR],
})
export class SimulationModule {}
