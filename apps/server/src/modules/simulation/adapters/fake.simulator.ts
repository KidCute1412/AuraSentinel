import { Injectable } from '@nestjs/common';
import type { SimResult, SwapIntent } from '../../../core/types';
import type { SimulatorPort } from '../simulator.port';

/** Deterministic stand-in for unit tests and for work before the contracts are deployed. */
@Injectable()
export class FakeSimulator implements SimulatorPort {
  async simulate(intent: SwapIntent): Promise<SimResult> {
    return {
      ok: true,
      amountOut: intent.minAmountOut,
      balancesBefore: {},
      balancesAfter: {},
    };
  }
}
