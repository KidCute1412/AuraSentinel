import { describe, expect, it } from 'vitest';
import type { SwapIntent } from '../../../core/types';
import { precheck, type PrecheckPolicy } from './precheck';

const SAFE = '0x1111111111111111111111111111111111111111';
const policy: PrecheckPolicy = {
  isActive: true,
  allowedRecipient: SAFE,
  maxPerTx: 500n,
  dailyBudget: 1000n,
  spentToday: 0n,
};
const intent: SwapIntent = {
  tokenIn: '0x2222222222222222222222222222222222222222',
  tokenOut: '0x3333333333333333333333333333333333333333',
  amountIn: 100n,
  minAmountOut: 90n,
  recipient: SAFE,
};

describe('precheck', () => {
  it('accepts a compliant intent', () => {
    expect(precheck(intent, policy)).toEqual({ ok: true });
  });
  it('blocks a foreign recipient', () => {
    const r = precheck({ ...intent, recipient: '0x9999999999999999999999999999999999999999' }, policy);
    expect(r).toEqual({ ok: false, reasonCode: 'RECIPIENT_NOT_ALLOWED' });
  });
  it('blocks over-withdraw', () => {
    expect(precheck({ ...intent, amountIn: 2000n }, policy)).toEqual({ ok: false, reasonCode: 'EXCEEDS_MAX_PER_TX' });
  });
  it('blocks when revoked', () => {
    expect(precheck(intent, { ...policy, isActive: false })).toEqual({ ok: false, reasonCode: 'POLICY_REVOKED' });
  });
});
