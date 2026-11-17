import { toReasonCode, type ReasonCode } from '@agentshield/shared';
import { decodeErrorResult, encodeFunctionData, isHex, parseAbi, type Hex } from 'viem';
import { POLICY_MODULE_ABI } from './abis';

/**
 * Finds the raw revert data in a viem error (or returns it if already hex). viem nests the data
 * at different depths depending on the action (call, estimateGas, simulateContract), so walk the
 * whole `cause` chain and take the first `data` that is hex (or `{ data: hex }`).
 */
export function extractRevertData(error: unknown): Hex | undefined {
  if (typeof error === 'string') return isHex(error) && error.length >= 10 ? error : undefined;
  const seen = new Set<unknown>();
  let cur: unknown = error;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const data = (cur as { data?: unknown }).data;
    if (typeof data === 'string' && isHex(data) && data.length >= 10) return data;
    if (data && typeof data === 'object') {
      const inner = (data as { data?: unknown }).data;
      if (typeof inner === 'string' && isHex(inner) && inner.length >= 10) return inner;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Trader Joe V1 router / library revert strings (Uniswap V2 style), by the part after "Prefix: ". Checked against the
 * real Fuji router (L6): "JoeRouter: INSUFFICIENT_OUTPUT_AMOUNT", "JoeRouter: EXPIRED", "JoeLibrary: INVALID_PATH",
 * "JoeLibrary: INSUFFICIENT_INPUT_AMOUNT", "TransferHelper: TRANSFER_FROM_FAILED". The rest are the same library's
 * other checks. Matching the suffix keeps any Uniswap V2 fork working.
 */
const ROUTER_REASONS: Record<string, ReasonCode> = {
  INSUFFICIENT_OUTPUT_AMOUNT: 'ROUTER_INSUFFICIENT_OUTPUT',
  EXPIRED: 'ROUTER_EXPIRED',
  INVALID_PATH: 'ROUTER_INVALID_PATH',
  INSUFFICIENT_INPUT_AMOUNT: 'ROUTER_INSUFFICIENT_INPUT',
  INSUFFICIENT_AMOUNT: 'ROUTER_INSUFFICIENT_INPUT',
  INSUFFICIENT_LIQUIDITY: 'ROUTER_INSUFFICIENT_LIQUIDITY',
  TRANSFER_FROM_FAILED: 'ROUTER_TRANSFER_FAILED',
};
const ROUTER_PREFIXES = /^(JoeRouter|JoeLibrary|TransferHelper|UniswapV2Router|UniswapV2Library): /;

/** A revert string -> reason code: Safe core codes ("GS104") as they are, router strings via ROUTER_REASONS. */
function reasonFromString(message: string): ReasonCode {
  const m = ROUTER_PREFIXES.exec(message);
  if (m) return ROUTER_REASONS[message.slice(m[0].length)] ?? 'UNKNOWN_REVERT';
  return toReasonCode(message);
}

/**
 * Revert data or a viem error -> reason code from shared/errors (D6).
 * - AgentPolicyModule custom error -> its name (ExceedsPerTxCap, ...).
 * - Error(string) from Safe core ("GS104") -> that code.
 * - Error(string) from the Trader Joe router -> ROUTER_* (only reached when the router is called directly: on chain
 *   the Safe swallows it and the module reports SwapFailed, see probeRouterFailure).
 * - Anything else (no data, unknown selector, unknown string, panic) -> UNKNOWN_REVERT.
 */
export function decodeRevert(errorOrData: unknown): ReasonCode {
  const data = extractRevertData(errorOrData);
  if (!data) return 'UNKNOWN_REVERT';
  try {
    // viem also decodes the built-in Error(string) / Panic(uint256), which the ABI type omits.
    const decoded = decodeErrorResult({ abi: POLICY_MODULE_ABI, data }) as { errorName: string; args?: readonly unknown[] };
    if (decoded.errorName === 'Error') return reasonFromString(String(decoded.args?.[0] ?? ''));
    return toReasonCode(decoded.errorName);
  } catch {
    return 'UNKNOWN_REVERT';
  }
}

/** Minimal client surface for the probe, so it is testable without a node. */
export interface RouterCallClient {
  call(args: { account: Hex; to: Hex; data: Hex }): Promise<unknown>;
}

/**
 * The module turns every router failure into SwapFailed, because Safe.execTransactionFromModule returns false
 * without the reason. Ask the router the same question directly, as the Safe: Trader Joe checks the deadline and
 * minOut BEFORE pulling tokens, so this eth_call names the cause without any allowance. A router code (price moved,
 * expired, empty pool, no route) replaces SwapFailed; TRANSFER_FROM_FAILED (the quote was fine) or anything unclear
 * keeps SwapFailed. Read-only; never throws.
 */
export async function probeRouterFailure(
  client: RouterCallClient,
  p: { router: Hex; safe: Hex; tokenIn: Hex; tokenOut: Hex; amountIn: bigint; minOut: bigint; deadline: bigint },
): Promise<ReasonCode> {
  try {
    await client.call({
      account: p.safe,
      to: p.router,
      data: encodeFunctionData({
        abi: ROUTER_SWAP_ABI,
        functionName: 'swapExactTokensForTokens',
        args: [p.amountIn, p.minOut, [p.tokenIn, p.tokenOut], p.safe, p.deadline],
      }),
    });
    return 'SwapFailed'; // the router alone would have accepted it: the failure is elsewhere
  } catch (err) {
    const code = decodeRevert(err);
    return code.startsWith('ROUTER_') && code !== 'ROUTER_TRANSFER_FAILED' ? code : 'SwapFailed';
  }
}

const ROUTER_SWAP_ABI = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
]);
