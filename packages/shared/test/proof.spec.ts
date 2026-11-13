import { describe, expect, it } from 'vitest';
import { ProofDto } from '../src';

/** Fixture shaped like api.md #14. */
const proof = {
  network: { name: 'Avalanche Fuji', chainId: 43113 },
  contracts: [{ name: 'AgentPolicyModule', address: '0xdEfceF650628E3d31cB6Aff2a1AfC7124a12E42B', verified: true, explorerUrl: 'https://testnet.snowtrace.io/address/0xdEfc' }],
  finality: { samples: 3, avgMs: 1480, minMs: 1140, maxMs: 2100, recentMs: [1200, 2100, 1140] },
  tests: { fuzzRuns: 10000, invariants: ['spentTodayLeCap'], passed: true, slither: '0 high' },
  blockedTxs: [{ txHash: `0x${'ab'.repeat(32)}`, error: 'ExceedsPerTxCap', at: '2026-11-13T10:00:00.000Z' }],
};

describe('ProofDto (api.md #14)', () => {
  it('parses the documented shape', () => {
    expect(ProofDto.parse(proof)).toEqual(proof);
  });

  it('accepts an empty proof (nothing measured yet) without invented numbers', () => {
    const empty = { ...proof, finality: { samples: 0, avgMs: 0, minMs: 0, maxMs: 0 }, blockedTxs: [] };
    expect(ProofDto.parse(empty)).toEqual(empty);
  });

  it('rejects a negative latency', () => {
    expect(ProofDto.safeParse({ ...proof, finality: { ...proof.finality, minMs: -1 } }).success).toBe(false);
  });
});
