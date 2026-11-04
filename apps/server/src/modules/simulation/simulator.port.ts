import type { SimResult, SwapIntent } from '../../core/types';

export const SIMULATOR = Symbol('SIMULATOR');

export interface SimulatorPort {
  simulate(intent: SwapIntent): Promise<SimResult>;
}
