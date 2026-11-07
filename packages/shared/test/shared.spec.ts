import { describe, expect, it } from 'vitest';
import {
  Amount,
  ProblemDetails,
  ServerEvent,
  SwapIntent,
  formatUnits,
  fromAmount,
  intentToBigint,
  intentToWire,
  parseUnits,
  problem,
  toAmount,
} from '../src';

const A = '0x' + 'a'.repeat(40);
const B = '0x' + 'b'.repeat(40);
const TX = '0x' + 'c'.repeat(64);

describe('money', () => {
  it('round-trips bigint beyond 2^53', () => {
    const big = 123456789012345678901234567890n;
    expect(fromAmount(toAmount(big))).toBe(big);
  });
  it('rejects floats, negatives, leading zeros', () => {
    for (const bad of ['1.5', '-1', '01', '', '1e18']) expect(Amount.safeParse(bad).success).toBe(false);
  });
  it('formats and parses units exactly', () => {
    expect(formatUnits(1500000n, 6)).toBe('1.5');
    expect(parseUnits('1.5', 6)).toBe(1500000n);
    expect(() => parseUnits('1.1234567', 6)).toThrow();
  });
});

describe('SwapIntent', () => {
  it('round-trips wire <-> bigint', () => {
    const wire = SwapIntent.parse({
      tokenIn: A,
      tokenOut: B,
      amountIn: '200000000',
      minAmountOut: '9500000000000000000',
      recipient: A,
      origin: 'manual',
    });
    expect(intentToWire(intentToBigint(wire))).toEqual(wire);
  });
});

describe('ServerEvent', () => {
  it('accepts vault.registered', () => {
    expect(ServerEvent.safeParse({ type: 'vault.registered', vault: A, module: B, owner: A }).success).toBe(true);
  });
  it('rejects events without vault', () => {
    expect(ServerEvent.safeParse({ type: 'chain.revoked', txHash: TX }).success).toBe(false);
  });
  it('rejects unknown type and non-integer money', () => {
    expect(ServerEvent.safeParse({ type: 'nope', vault: A }).success).toBe(false);
    expect(
      ServerEvent.safeParse({
        type: 'chain.swap',
        vault: A,
        tokenIn: A,
        tokenOut: B,
        amountIn: '1.5',
        amountOut: '1',
        spentToday: '1',
        txHash: TX,
      }).success,
    ).toBe(false);
  });
});

describe('problem+json', () => {
  it('builds a valid RFC 9457 body', () => {
    const p = problem('NOT_OWNER', 'Not owner', 'Ví không phải owner của Safe');
    expect(ProblemDetails.parse(p).status).toBe(403);
  });
});
