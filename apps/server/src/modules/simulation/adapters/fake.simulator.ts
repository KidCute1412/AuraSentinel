import { Injectable } from '@nestjs/common';
import type { SimResult, SwapIntent } from '../../../core/types';
import type { SimTarget, SimulatorPort } from '../simulator.port';

/** Deterministic stand-in for unit tests and for work before the contracts are deployed. */
@Injectable()
export class FakeSimulator implements SimulatorPort {
  async simulate(intent: SwapIntent, _target?: SimTarget): Promise<SimResult> {
    return {
      ok: true,
      deltaSafeTokenOut: intent.minAmountOut.toString(),
      deltaSafeTokenIn: (-intent.amountIn).toString(),
      attackerBalance: '0',
      allowanceAfter: '0',
    };
  }
}
