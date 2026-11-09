import { encodeFunctionData, type Address } from 'viem';
import { ERC20_ABI, POLICY_MODULE_ABI, SAFE_MODULE_ABI } from '../../core/chain/abis';
import type { RawCall } from '../execution/tx-sender.port';
import type { OnchainPlan } from './scenarios';

/**
 * Manual gas for the on-chain attacks. If viem estimated gas, the revert would be caught in the
 * client and never mined, so there would be no Snowtrace evidence (system-design §5).
 */
export const ATTACK_GAS = 300_000n;

/** Deadline for the bypass swap: inside the module's 10-minute window (C4), so the cap fires. */
export const BYPASS_DEADLINE_SECONDS = 300n;

/**
 * ABIs come from core/chain (hand-written per contracts.md until L1 commits the generated ones,
 * D5): a wrong selector would revert without data (UNKNOWN_REVERT), not with ExceedsPerTxCap.
 */
export { ERC20_ABI, POLICY_MODULE_ABI, SAFE_MODULE_ABI };

/** Enum.Operation.Call. Never DelegateCall (C6). */
const OPERATION_CALL = 0;

export type { RawCall };

export function buildOnchainCall(
  plan: OnchainPlan,
  addrs: { safe: Address; module: Address },
  nowSeconds: bigint,
): RawCall {
  if (plan.call === 'guarded-swap-direct') {
    return {
      to: addrs.module,
      gas: ATTACK_GAS,
      data: encodeFunctionData({
        abi: POLICY_MODULE_ABI,
        functionName: 'executeGuardedSwap',
        args: [plan.tokenIn, plan.tokenOut, plan.amountIn, plan.minOut, nowSeconds + BYPASS_DEADLINE_SECONDS],
      }),
    };
  }
  const approve = encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [plan.spender, plan.amount] });
  return {
    to: addrs.safe,
    gas: ATTACK_GAS,
    data: encodeFunctionData({
      abi: SAFE_MODULE_ABI,
      functionName: 'execTransactionFromModule',
      args: [plan.token, 0n, approve, OPERATION_CALL],
    }),
  };
}
