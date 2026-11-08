import type { AttackScenario } from '@agentshield/shared';
import type { Env } from '../../../core/config/env.schema';
import type { SwapIntent } from '../../../core/types';

type Address = SwapIntent['recipient'];

/** A visibly hostile address ("0x999…" in the docs and on stage). Never a real key holder. */
export const ATTACKER: Address = '0x9999999999999999999999999999999999999999';

const USDC_UNIT = 10n ** 6n; // TOKEN_A is MockUSDC, 6 decimals
/** 2,000 USDC: above the 500 per-tx cap and the 1,500 daily cap of the demo vault. */
export const OVER_CAP_AMOUNT = 2_000n * USDC_UNIT;
/** 10 USDC: inside every cap, so the only thing wrong with attack #2 is the recipient. */
export const SMALL_AMOUNT = 10n * USDC_UNIT;
/** Any positive minOut: keeps C3 (ZeroMinOut) out of the way so the intended gate fires. */
export const ANY_MIN_OUT = 1n;

export interface AttackContext {
  /** The vault under attack. */
  safe: Address;
  usdc: Address;
  wavax: Address;
}

/**
 * What a scenario does, decided before any I/O:
 * - shield1: a SwapIntent sent through the normal swap queue, so Shield 1 must stop it.
 * - onchain: a transaction signed with the session key and sent straight to Fuji, skipping
 *   Shield 1, with manual gas so the revert is mined (Snowtrace evidence).
 */
export type AttackPlan =
  | { mode: 'shield1'; intent: SwapIntent; untrustedText?: string }
  | { mode: 'onchain'; call: 'guarded-swap-direct'; tokenIn: Address; tokenOut: Address; amountIn: bigint; minOut: bigint }
  | { mode: 'onchain'; call: 'approve-via-safe'; token: Address; spender: Address; amount: bigint };

export type OnchainPlan = Extract<AttackPlan, { mode: 'onchain' }>;

export interface AttackScenarioDef {
  readonly id: AttackScenario;
  /** `text` is only set for prompt-injection (validated by CreateAttackRequest). */
  plan(ctx: AttackContext, text?: string): AttackPlan;
}

export class AttackConfigError extends Error {}

/** Token addresses come from env until the vault registry (A3) serves them per vault. */
export function attackContext(env: Env, safe: Address): AttackContext {
  const { TOKEN_A_ADDRESS: usdc, TOKEN_B_ADDRESS: wavax } = env;
  if (!usdc || !wavax) throw new AttackConfigError('TOKEN_A_ADDRESS and TOKEN_B_ADDRESS are required');
  return { safe, usdc, wavax };
}
