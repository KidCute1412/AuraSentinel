import {
  type AuditEntry,
  Explanation,
  SimResult,
  SwapIntent,
  JobDetailDto,
  type JobDto,
  type JobOrigin,
} from '@agentshield/shared';
import { getAddress, isAddress, zeroAddress } from 'viem';
import type { auditLog, jobs } from '../../core/database/schema';

export type JobRow = typeof jobs.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;

export const EXPLORER = 'https://testnet.snowtrace.io';
export const SHIELDS = ['precheck', 'simulation', 'invariant', 'onchain'] as const;
export type Shield = (typeof SHIELDS)[number];

const isShield = (s: string): s is Shield => (SHIELDS as readonly string[]).includes(s);

/** Rows store `kind` as 'rebalance' | 'attack:<scenario>'; the API speaks swap | attack. */
const isAttack = (row: Pick<JobRow, 'kind'>) => row.kind.startsWith('attack');

function origin(row: JobRow, intent: SwapIntent | null): JobOrigin {
  if (isAttack(row)) return 'redteam';
  return intent?.origin ?? 'manual';
}

/** jsonb columns are typed `unknown`: parse them, and drop (null) anything that does not fit the contract. */
const parsed = <T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }, v: unknown) => {
  if (v == null) return null;
  const r = schema.safeParse(v);
  return r.success ? r.data : null;
};

/** DB row -> JobDto (api.md §5). Pure, so it can be shared by the REST and SSE paths. */
export function toJobDto(row: JobRow): JobDto {
  const intent = parsed<SwapIntent>(SwapIntent, row.intent);
  const txHash = (row.txHash as JobDto['txHash']) ?? null;
  return {
    id: row.id,
    vault: isAddress(row.vault) ? getAddress(row.vault) : zeroAddress,
    kind: isAttack(row) ? 'attack' : 'swap',
    origin: origin(row, intent),
    status: row.status,
    intent,
    txHash,
    explorerUrl: txHash ? `${EXPLORER}/tx/${txHash}` : null,
    revertError: row.status === 'reverted' ? (row.reasonCode ?? 'UNKNOWN_REVERT') : null,
    reasonCode: row.reasonCode ?? null,
    explanation: parsed<Explanation>(Explanation, row.explanation),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** One audit_log row per Shield verdict; status-transition rows are skipped here. */
export function toAuditEntries(rows: readonly AuditRow[]): AuditEntry[] {
  return rows.flatMap((r) => {
    if (!isShield(r.step)) return [];
    const p = (r.payload ?? {}) as { result?: unknown; reason?: unknown };
    return [
      {
        shield: r.step,
        result: p.result === 'pass' ? 'pass' : 'fail',
        reason: typeof p.reason === 'string' ? p.reason : null,
        ts: r.at.toISOString(),
      },
    ];
  });
}

/** Shape of jobs.precheck (JobDetailDto.precheck without the null). */
const PrecheckJson = JobDetailDto.shape.precheck.unwrap();

/** GET /jobs/{id}: JobDto + precheck + sim + audit trail. */
export function toJobDetail(row: JobRow, audit: readonly AuditRow[]): JobDetailDto {
  return {
    ...toJobDto(row),
    precheck: parsed<JobDetailDto['precheck']>(PrecheckJson, row.precheck),
    sim: parsed<SimResult>(SimResult, row.simResult),
    audit: toAuditEntries(audit),
  };
}
