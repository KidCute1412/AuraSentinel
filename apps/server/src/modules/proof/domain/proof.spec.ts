import { describe, expect, it } from 'vitest';
import { TESTS_NOT_RUN, finalityStats, parseTestsArtifact } from './proof';

const t = (sent: number, mined: number) => ({ sentAt: new Date(sent), minedAt: new Date(mined) });

describe('finalityStats', () => {
  it('aggregates send -> receipt latency over the newest samples', () => {
    expect(finalityStats([t(0, 1_200), t(0, 2_100), t(0, 1_140)])).toEqual({
      samples: 3,
      avgMs: 1_480,
      minMs: 1_140,
      maxMs: 2_100,
      recentMs: [1_200, 2_100, 1_140],
    });
  });

  it('keeps only the newest N and drops impossible (negative) samples', () => {
    const s = finalityStats([t(0, 100), t(500, 0), t(0, 300), t(0, 900)], 2);
    expect(s.recentMs).toEqual([100, 300]);
  });

  it('reports zero samples rather than inventing numbers', () => {
    expect(finalityStats([])).toEqual({ samples: 0, avgMs: 0, minMs: 0, maxMs: 0, recentMs: [] });
  });
});

describe('parseTestsArtifact', () => {
  it('keeps a well-formed CI artifact', () => {
    const raw = { fuzzRuns: 10_000, invariants: ['spentTodayLeCap', 7], passed: true, slither: '0 high', extra: 'x' };
    expect(parseTestsArtifact(raw)).toEqual({ fuzzRuns: 10_000, invariants: ['spentTodayLeCap'], passed: true, slither: '0 high' });
  });

  it('falls back to "not run" for anything malformed', () => {
    expect(parseTestsArtifact(null)).toBe(TESTS_NOT_RUN);
    expect(parseTestsArtifact({ fuzzRuns: '10000', invariants: [], passed: true })).toBe(TESTS_NOT_RUN);
    expect(parseTestsArtifact({ fuzzRuns: 5, invariants: [], passed: 'yes' })).toBe(TESTS_NOT_RUN);
  });
});
