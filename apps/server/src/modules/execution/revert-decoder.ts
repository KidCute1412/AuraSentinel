/**
 * TODO: decodeErrorResult(abi from shared, data) -> reason code from shared/errors.
 * Unknown selectors map to 'UNKNOWN_REVERT'.
 */
export function decodeRevert(_error: unknown): string {
  return 'UNKNOWN_REVERT';
}
