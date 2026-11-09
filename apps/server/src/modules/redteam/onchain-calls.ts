import { encodeFunctionData, parseAbi, type Address, type Hex } from 'viem';
import type { OnchainPlan } from './scenarios';

/**
 * Manual gas for the on-chain attacks. If viem estimated gas, the revert would be caught in the
 * client and never mined, so there would be no Snowtrace evidence (system-design §5).
 */
export const ATTACK_GAS = 300_000n;

/** Deadline for the bypass swap: inside the module's 10-minute window (C4), so the cap fires. */
export const BYPASS_DEADLINE_SECONDS = 300n;

/**
 * Hand-written fragments. Safe and ERC-20 are stable standards. The module signature follows
 * contracts.md §3 and MUST be replaced by the generated ABI from @agentshield/shared once L1
 * commits it (D5): a wrong selector would revert without data (UNKNOWN_REVERT), not with
 * ExceedsPerTxCap.
 */
export const POLICY_MODULE_ABI = parseAbi([
  'function executeGuardedSwap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)',
]);
export const SAFE_MODULE_ABI = parseAbi([
  'function execTransactionFromModule(address to, uint256 value, bytes data, uint8 operation) returns (bool success)',
]);
export const ERC20_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);

/** Enum.Operation.Call. Never DelegateCall (C6). */
const OPERATION_CALL = 0;

/** A raw transaction for the session key to sign. No key and no signing here. */
export interface RawCall {
  to: Address;
  data: Hex;
  gas: bigint;
}

/** Signing happens in modules/execution only (P5); A4 implements this on the shared TxSender. */
export interface RawTxSender {
  sendRaw(call: RawCall): Promise<{ hash: Hex; status: 'success' | 'reverted'; revertData?: Hex }>;
}

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
