import type { Env } from '../../../core/config/env.schema';
import type { SwapIntent } from '../../../core/types';

export interface ScenarioContext {
  env: Env;
  /** Enqueue an intent through the normal Shield 1 pipeline; resolves to the job id. */
  enqueueSwap(kind: string, intent: SwapIntent): Promise<string>;
}

export interface AttackScenario {
  readonly name: string;
  run(ctx: ScenarioContext): Promise<{ jobId?: string }>;
}

export function requireAddresses(env: Env) {
  const { SAFE_ADDRESS: safe, TOKEN_A_ADDRESS: tokenA, TOKEN_B_ADDRESS: tokenB } = env;
  if (!safe || !tokenA || !tokenB) throw new Error('SAFE_ADDRESS, TOKEN_A_ADDRESS, TOKEN_B_ADDRESS required');
  return { safe, tokenA, tokenB };
}
