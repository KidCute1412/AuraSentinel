import { z } from 'zod';

/** Base-unit amount as a non-negative decimal string. No floats anywhere (invariant 4). */
export const Amount = z.string().regex(/^(0|[1-9]\d*)$/, 'amount must be a non-negative integer string');
export type Amount = z.infer<typeof Amount>;

/** Signed base-unit delta (balance changes in simulation). */
export const SignedAmount = z.string().regex(/^-?(0|[1-9]\d*)$/, 'amount must be an integer string');
export type SignedAmount = z.infer<typeof SignedAmount>;

export const toAmount = (v: bigint): Amount => {
  if (v < 0n) throw new RangeError('Amount cannot be negative');
  return v.toString();
};

export const fromAmount = (a: string): bigint => BigInt(Amount.parse(a));

export const toSignedAmount = (v: bigint): SignedAmount => v.toString();
export const fromSignedAmount = (a: string): bigint => BigInt(SignedAmount.parse(a));

/** Format base units for display with exact bigint math: formatUnits(1500000n, 6) -> "1.5". */
export function formatUnits(value: bigint, decimals: number): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Parse a decimal string into base units: parseUnits("1.5", 6) -> 1500000n. Rejects excess precision. */
export function parseUnits(value: string, decimals: number): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!m) throw new SyntaxError(`invalid decimal amount: ${value}`);
  const [, whole, frac = ''] = m;
  if (frac.length > decimals) throw new RangeError(`more than ${decimals} decimals: ${value}`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}
