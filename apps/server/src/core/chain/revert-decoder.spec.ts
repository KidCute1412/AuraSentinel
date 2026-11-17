import { encodeErrorResult, parseAbi } from 'viem';
import { describe, expect, it } from 'vitest';
import { POLICY_MODULE_ABI } from './abis';
import { decodeRevert, extractRevertData, probeRouterFailure } from './revert-decoder';

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

  // Real revert data from the Trader Joe router on Fuji (cast call, 2026-11-17): a change in its strings shows up here.
  const REAL_ROUTER_REVERTS: [string, `0x${string}`][] = [
    ['ROUTER_INSUFFICIENT_OUTPUT', '0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000254a6f65526f757465723a20494e53554646494349454e545f4f55545055545f414d4f554e54000000000000000000000000000000000000000000000000000000'],
    ['ROUTER_EXPIRED', '0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000124a6f65526f757465723a20455850495245440000000000000000000000000000'],
    ['ROUTER_INVALID_PATH', '0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000184a6f654c6962726172793a20494e56414c49445f504154480000000000000000'],
    ['ROUTER_INSUFFICIENT_INPUT', '0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000254a6f654c6962726172793a20494e53554646494349454e545f494e5055545f414d4f554e54000000000000000000000000000000000000000000000000000000'],
    ['ROUTER_TRANSFER_FAILED', '0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000245472616e7366657248656c7065723a205452414e534645525f46524f4d5f4641494c454400000000000000000000000000000000000000000000000000000000'],
  ];

  it('maps the real Trader Joe router reverts to ROUTER_* codes', () => {
    for (const [code, data] of REAL_ROUTER_REVERTS) expect(decodeRevert(data)).toBe(code);
  });

  it('maps the other library strings and Uniswap V2 forks by their suffix; anything new stays UNKNOWN_REVERT', () => {
    const str = (m: string) => encodeErrorResult({ abi: parseAbi(['error Error(string)']), errorName: 'Error', args: [m] });
    expect(decodeRevert(str('JoeLibrary: INSUFFICIENT_LIQUIDITY'))).toBe('ROUTER_INSUFFICIENT_LIQUIDITY');
    expect(decodeRevert(str('JoeLibrary: INSUFFICIENT_AMOUNT'))).toBe('ROUTER_INSUFFICIENT_INPUT');
    expect(decodeRevert(str('UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT'))).toBe('ROUTER_INSUFFICIENT_OUTPUT');
    expect(decodeRevert(str('JoeRouter: SOMETHING_NEW'))).toBe('UNKNOWN_REVERT');
    expect(decodeRevert(str('Joe: K'))).toBe('UNKNOWN_REVERT');
    expect(decodeRevert(encodeErrorResult({ abi: parseAbi(['error Panic(uint256)']), errorName: 'Panic', args: [0x11n] }))).toBe('UNKNOWN_REVERT');
  });
});

describe('probeRouterFailure', () => {
  const p = {
    router: '0x6666666666666666666666666666666666666666',
    safe: '0x1111111111111111111111111111111111111111',
    tokenIn: '0x3333333333333333333333333333333333333333',
    tokenOut: '0x4444444444444444444444444444444444444444',
    amountIn: 100n,
    minOut: 7n,
    deadline: 1_300n,
  } as const;
  const failWith = (m: string) => ({
    call: async () => {
      throw Object.assign(new Error('reverted'), { cause: { data: encodeErrorResult({ abi: parseAbi(['error Error(string)']), errorName: 'Error', args: [m] }) } });
    },
  });

  it('names the router cause; keeps SwapFailed when the router alone would accept or only lacks the allowance', async () => {
    expect(await probeRouterFailure(failWith('JoeRouter: INSUFFICIENT_OUTPUT_AMOUNT'), p)).toBe('ROUTER_INSUFFICIENT_OUTPUT');
    expect(await probeRouterFailure(failWith('JoeRouter: EXPIRED'), p)).toBe('ROUTER_EXPIRED');
    expect(await probeRouterFailure(failWith('TransferHelper: TRANSFER_FROM_FAILED'), p)).toBe('SwapFailed');
    expect(await probeRouterFailure(failWith('GS104'), p)).toBe('SwapFailed');
    expect(await probeRouterFailure({ call: async () => ({ data: '0x' }) }, p)).toBe('SwapFailed');
    expect(await probeRouterFailure({ call: async () => Promise.reject(new Error('timeout')) }, p)).toBe('SwapFailed');
  });
});
