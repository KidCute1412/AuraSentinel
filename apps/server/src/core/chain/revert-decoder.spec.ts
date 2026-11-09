import { encodeErrorResult, parseAbi } from 'viem';
import { describe, expect, it } from 'vitest';
import { POLICY_MODULE_ABI } from './abis';
import { decodeRevert, extractRevertData } from './revert-decoder';

const capData = encodeErrorResult({ abi: POLICY_MODULE_ABI, errorName: 'ExceedsPerTxCap' });
const gs104 = encodeErrorResult({ abi: parseAbi(['error Error(string)']), errorName: 'Error', args: ['GS104'] });

describe('decodeRevert', () => {
  it('maps every module custom error to the reason code of the same name', () => {
    for (const item of POLICY_MODULE_ABI) {
      if (item.type !== 'error') continue;
      expect(decodeRevert(encodeErrorResult({ abi: POLICY_MODULE_ABI, errorName: item.name }))).toBe(item.name);
    }
  });

  it('maps the Safe core Error("GS104") string to GS104', () => {
    expect(decodeRevert(gs104)).toBe('GS104');
  });

  it('finds the data nested in a viem error cause chain', () => {
    const err = Object.assign(new Error('call reverted'), { cause: { cause: { data: capData } } });
    expect(decodeRevert(err)).toBe('ExceedsPerTxCap');
    expect(extractRevertData({ cause: { data: { data: capData } } })).toBe(capData);
  });

  it('falls back to UNKNOWN_REVERT for no data, unknown selectors and unknown strings', () => {
    expect(decodeRevert(undefined)).toBe('UNKNOWN_REVERT');
    expect(decodeRevert(new Error('timeout'))).toBe('UNKNOWN_REVERT');
    expect(decodeRevert('0xdeadbeef')).toBe('UNKNOWN_REVERT');
    expect(decodeRevert(encodeErrorResult({ abi: parseAbi(['error Error(string)']), errorName: 'Error', args: ['nope'] }))).toBe('UNKNOWN_REVERT');
  });
});
