import { describe, expect, it } from 'vitest';
import { AuditEntry, CheckRow } from '../src';

const ts = '2026-11-19T10:00:00.000Z';

describe('rule table (AuditEntry.checks)', () => {
  it('defaults to an empty table for entries recorded before it existed', () => {
    expect(AuditEntry.parse({ shield: 'precheck', result: 'pass', reason: null, ts })).toMatchObject({ checks: [] });
  });

  it('carries typed values, signed amounts included (simulation deltas)', () => {
    const row = {
      id: 'sim-token-in',
      pass: true,
      reasonCode: null,
      actual: { type: 'amount', amount: '-200000000', token: '0x3333333333333333333333333333333333333333', symbol: 'USDC', decimals: 6 },
      limit: null,
    };
    expect(CheckRow.parse(row)).toEqual(row);
    expect(CheckRow.safeParse({ ...row, actual: { type: 'amount', amount: '1.5', token: row.actual.token, symbol: 'USDC', decimals: 6 } }).success).toBe(false);
    expect(CheckRow.safeParse({ ...row, actual: { type: 'nope' } }).success).toBe(false);
  });
});
