import { JobDetailDto, JobDto } from '@agentshield/shared';
import { describe, expect, it } from 'vitest';
import { toAuditEntries, toJobDetail, toJobDto, type AuditRow, type JobRow } from './job.mapper';

const SAFE_LC = '0x8ba1f109551bd432803012645ac136ddd64dba72';
const SAFE = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';
const TX = `0x${'ab'.repeat(32)}`;
const at = new Date('2026-11-13T10:00:00Z');

const row = (over: Partial<JobRow> = {}): JobRow => ({
  id: '7f9c0000-0000-4000-8000-000000000001',
  vault: SAFE_LC,
  kind: 'rebalance',
  status: 'confirmed',
  intent: {
    tokenIn: '0x3333333333333333333333333333333333333333',
    tokenOut: '0x4444444444444444444444444444444444444444',
    amountIn: '200000000',
    minAmountOut: '7920000000000000000',
    recipient: SAFE,
    origin: 'manual',
  },
  precheck: { ok: true, reasons: [] },
  simResult: { ok: true, deltaSafeTokenOut: '8', deltaSafeTokenIn: '-200000000', attackerBalance: '0', allowanceAfter: '0' },
  explanation: null,
  reasonCode: null,
  txHash: TX,
  createdAt: at,
  updatedAt: at,
  ...over,
});

const audit = (step: string, payload: unknown, id = 1): AuditRow => ({ id, jobId: row().id, step, payload, at });

describe('toJobDto', () => {
  it('produces a valid shared JobDto with a checksummed vault and an explorer link', () => {
    const dto = toJobDto(row());
    expect(JobDto.parse(dto)).toEqual(dto);
    expect(dto).toMatchObject({ vault: SAFE, kind: 'swap', origin: 'manual', explorerUrl: `https://testnet.snowtrace.io/tx/${TX}` });
  });

  it('maps attack rows to kind attack / origin redteam, with revertError on a revert', () => {
    const dto = toJobDto(row({ kind: 'attack:bypass', intent: null, status: 'reverted', reasonCode: 'ExceedsPerTxCap' }));
    expect(dto).toMatchObject({ kind: 'attack', origin: 'redteam', intent: null, revertError: 'ExceedsPerTxCap' });
  });

  it('drops jsonb that does not fit the contract instead of leaking it', () => {
    expect(toJobDto(row({ explanation: { verdict: 'maybe' } })).explanation).toBeNull();
  });
});

describe('toJobDetail', () => {
  it('keeps only shield rows in the audit trail, in order', () => {
    const detail = toJobDetail(row(), [
      audit('prechecking', {}, 1),
      audit('precheck', { result: 'pass', reason: null }, 2),
      audit('simulation', { result: 'fail', reason: 'PolicyInactive' }, 3),
      audit('rejected', { reasonCode: 'PolicyInactive' }, 4),
    ]);
    expect(JobDetailDto.parse(detail)).toEqual(detail);
    expect(detail.audit.map((a) => [a.shield, a.result, a.reason])).toEqual([
      ['precheck', 'pass', null],
      ['simulation', 'fail', 'PolicyInactive'],
    ]);
    expect(detail.precheck).toEqual({ ok: true, reasons: [] });
    expect(detail.sim?.deltaSafeTokenIn).toBe('-200000000');
  });

  it('treats a missing result as fail (fail closed)', () => {
    expect(toAuditEntries([audit('invariant', null)])[0]!.result).toBe('fail');
  });
});
