import { Injectable } from '@nestjs/common';
import type { SimResult, SwapIntent } from '../../../core/types';
import type { SimulatorPort } from '../simulator.port';

/** TODO(FS2): anvil_reset -> impersonate Safe/module -> call -> read balances/allowances. */
@Injectable()
export class AnvilSimulator implements SimulatorPort {
  async simulate(_intent: SwapIntent): Promise<SimResult> {
    throw new Error('AnvilSimulator not implemented');
  }
}
