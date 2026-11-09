/**
 * Lives in core/chain because both execution (mined reverts) and simulation (sim reverts) decode
 * with the same ABI and must agree on the reason code.
 */
export { decodeRevert, extractRevertData } from '../../core/chain/revert-decoder';
