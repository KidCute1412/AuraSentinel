import type { ProofDto } from '@agentshield/shared';

/** One agent transaction: when the job entered `broadcasting` and when its receipt landed. */
export interface TxTiming {
  sentAt: Date;
  minedAt: Date;
}

/** Aggregates over the most recent samples (newest first). Rounded to whole ms. */
export function finalityStats(timings: readonly TxTiming[], keep = 10): ProofDto['finality'] {
  const ms = timings
    .map((t) => t.minedAt.getTime() - t.sentAt.getTime())
    .filter((v) => Number.isFinite(v) && v >= 0)
    .slice(0, keep);
  if (ms.length === 0) return { samples: 0, avgMs: 0, minMs: 0, maxMs: 0, recentMs: [] };
  const sum = ms.reduce((a, b) => a + b, 0);
  return {
    samples: ms.length,
    avgMs: Math.round(sum / ms.length),
    minMs: Math.min(...ms),
    maxMs: Math.max(...ms),
    recentMs: ms,
  };
}

/** Shown until the L5 CI artifact exists: honest "nothing measured yet", never sample numbers. */
export const TESTS_NOT_RUN: ProofDto['tests'] = { fuzzRuns: 0, invariants: [], passed: false, slither: 'not run' };

/** The CI artifact is untrusted input: keep only well-formed fields, else report "not run". */
export function parseTestsArtifact(raw: unknown): ProofDto['tests'] {
  const o = raw as Partial<Record<keyof ProofDto['tests'], unknown>> | null;
  if (!o || typeof o !== 'object') return TESTS_NOT_RUN;
  const fuzzRuns = typeof o.fuzzRuns === 'number' && Number.isInteger(o.fuzzRuns) && o.fuzzRuns >= 0 ? o.fuzzRuns : null;
  const invariants = Array.isArray(o.invariants) ? o.invariants.filter((x): x is string => typeof x === 'string') : null;
  if (fuzzRuns === null || invariants === null || typeof o.passed !== 'boolean') return TESTS_NOT_RUN;
  return { fuzzRuns, invariants, passed: o.passed, slither: typeof o.slither === 'string' ? o.slither : 'not run' };
}
