import { encodeFunctionData, type Hex } from 'viem';
import type { SwapIntent } from '../types';
import { POLICY_MODULE_ABI, SWAP_DEADLINE_SECONDS } from './abis';

/**
 * The one calldata builder for executeGuardedSwap, shared by the simulator (Shield 1) and the
 * TxSender (real tx) so both run byte-identical calls.
 *
 * `intent.recipient` is deliberately NOT encoded (D2): the module has no recipient parameter and
 * hard-codes the Safe. A tampered recipient can only be caught by precheck; it can never reach
 * the chain. Only the fields picked below cross this line.
 */
export function encodeGuardedSwap(
  intent: Pick<SwapIntent, 'tokenIn' | 'tokenOut' | 'amountIn' | 'minAmountOut'>,
  deadline: bigint,
): Hex {
  return encodeFunctionData({
    abi: POLICY_MODULE_ABI,
    functionName: 'executeGuardedSwap',
    args: [intent.tokenIn, intent.tokenOut, intent.amountIn, intent.minAmountOut, deadline],
  });
}

/** Deadline for a swap built at `nowSec` (unix seconds): half of the module's 10 minute window (C4). */
export const swapDeadline = (nowSec: bigint): bigint => nowSec + SWAP_DEADLINE_SECONDS;
