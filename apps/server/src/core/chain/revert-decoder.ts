import { toReasonCode, type ReasonCode } from '@agentshield/shared';
import { decodeErrorResult, isHex, type Hex } from 'viem';
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
 * Revert data or a viem error -> reason code from shared/errors (D6).
 * - AgentPolicyModule custom error -> its name (ExceedsPerTxCap, ...).
 * - Error(string) from Safe core ("GS104") -> that code.
 * - Anything else (no data, unknown selector, panic) -> UNKNOWN_REVERT.
 */
export function decodeRevert(errorOrData: unknown): ReasonCode {
  const data = extractRevertData(errorOrData);
  if (!data) return 'UNKNOWN_REVERT';
  try {
    // viem also decodes the built-in Error(string) / Panic(uint256), which the ABI type omits.
    const decoded = decodeErrorResult({ abi: POLICY_MODULE_ABI, data }) as { errorName: string; args?: readonly unknown[] };
    if (decoded.errorName === 'Error') return toReasonCode(String(decoded.args?.[0] ?? ''));
    return toReasonCode(decoded.errorName);
  } catch {
    return 'UNKNOWN_REVERT';
  }
}
