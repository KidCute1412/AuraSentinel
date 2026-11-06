import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

/** Shape of GET /proof (docs/architecture/api.md section 8). `recentMs` is optional: the doc only guarantees the aggregates. */
const proofSchema = z.object({
  network: z.object({ name: z.string(), chainId: z.number() }),
  contracts: z.array(
    z.object({ name: z.string(), address: z.string(), verified: z.boolean(), explorerUrl: z.string().optional() }),
  ),
  finality: z.object({
    samples: z.number(),
    avgMs: z.number(),
    minMs: z.number(),
    maxMs: z.number(),
    recentMs: z.array(z.number()).optional(),
  }),
  tests: z.object({
    fuzzRuns: z.number(),
    invariants: z.array(z.string()),
    passed: z.boolean(),
    slither: z.string(),
  }),
  blockedTxs: z.array(z.object({ txHash: z.string(), error: z.string(), at: z.string(), explorerUrl: z.string().optional() })),
});

export type Proof = z.infer<typeof proofSchema>;

/** Illustrative numbers from the API doc. Shown only when the backend is unreachable, always labelled "sample". */
export const SAMPLE_PROOF: Proof = {
  network: { name: "Avalanche Fuji", chainId: 43113 },
  contracts: [
    { name: "AgentPolicyModule", address: "0x5a3e00000000000000000000000000000000a001", verified: true },
    { name: "ModuleFactory", address: "0x5a3e00000000000000000000000000000000a002", verified: true },
    { name: "MockUSDC", address: "0x5a3e00000000000000000000000000000000a003", verified: true },
    { name: "Demo Safe", address: "0x5a3e00000000000000000000000000000000a004", verified: true },
  ],
  finality: { samples: 10, avgMs: 1480, minMs: 1200, maxMs: 2100, recentMs: [1480, 1320, 1200, 1610, 1390, 2100, 1450, 1380, 1520, 1350] },
  tests: {
    fuzzRuns: 10000,
    invariants: ["spentTodayLeCap", "attackerBalanceZero", "revokedMeansNoSpend"],
    passed: true,
    slither: "0 high",
  },
  blockedTxs: [
    { txHash: "0x9c1d00000000000000000000000000000000000000000000000000000000b001", error: "ExceedsPerTxCap", at: "2026-11-05T09:12:41Z" },
    { txHash: "0x9c1d00000000000000000000000000000000000000000000000000000000b002", error: "ExceedsPerTxCap", at: "2026-11-05T09:14:07Z" },
    { txHash: "0x9c1d00000000000000000000000000000000000000000000000000000000b003", error: "ExceedsPerTxCap", at: "2026-11-05T09:20:55Z" },
  ],
};

async function fetchProof(): Promise<Proof> {
  const res = await fetch("/api/v1/proof");
  if (!res.ok) throw new Error(`proof ${res.status}`);
  return proofSchema.parse(await res.json());
}

/** Never blocks the UI: on loading or error callers get the sample data and `sample: true`. */
export function useProof(): { proof: Proof; sample: boolean } {
  const q = useQuery({ queryKey: ["proof"], queryFn: fetchProof, staleTime: 30_000 });
  return { proof: q.data ?? SAMPLE_PROOF, sample: !q.data };
}

export { useCountUp } from "@/shared/lib/useCountUp";
export { useReducedMotion } from "@/shared/lib/useReducedMotion";

export const shortHash = (h: string): string => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h);

export function formatUtc(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 19).replace("T", " ")}Z`;
}

export const seconds = (ms: number): string => `${(ms / 1000).toFixed(2)}s`;
