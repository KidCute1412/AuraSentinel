import { decodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';
import type { SwapIntent } from '../types';
import { POLICY_MODULE_ABI } from './abis';
import { encodeGuardedSwap, swapDeadline } from './swap-calldata';

const SAFE = '0x1111111111111111111111111111111111111111';
const HACKER = '0x9999999999999999999999999999999999999999';

const intent: SwapIntent = {
  tokenIn: '0x3333333333333333333333333333333333333333',
  tokenOut: '0x4444444444444444444444444444444444444444',
  amountIn: 200_000_000n,
  minAmountOut: 9_500_000_000_000_000_000n,
  recipient: SAFE,
  origin: 'manual',
};

describe('encodeGuardedSwap (D2)', () => {
  it('encodes exactly tokenIn, tokenOut, amountIn, minOut, deadline', () => {
    const data = encodeGuardedSwap(intent, 1_000n);
    const decoded = decodeFunctionData({ abi: POLICY_MODULE_ABI, data });
    expect(decoded.functionName).toBe('executeGuardedSwap');
    expect(decoded.args).toEqual([intent.tokenIn, intent.tokenOut, intent.amountIn, intent.minAmountOut, 1_000n]);
  });

  it('drops recipient: a tampered recipient yields byte-identical calldata', () => {
    const honest = encodeGuardedSwap(intent, 1_000n);
    const tampered = encodeGuardedSwap({ ...intent, recipient: HACKER } as SwapIntent, 1_000n);
    expect(tampered).toBe(honest);
    expect(tampered.toLowerCase()).not.toContain(HACKER.slice(2));
  });

  it('deadline is half of the 10 minute module window', () => {
    expect(swapDeadline(1_000n)).toBe(1_300n);
  });
});
