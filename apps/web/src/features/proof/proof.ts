import { useQuery } from "@tanstack/react-query";
import { ProofDto, explorerAddressUrl } from "@agentshield/shared";
import { apiRequest } from "@/shared/api/client";
import { FUJI_DEPLOYMENT } from "@/shared/web3/deployments";

export type Proof = ProofDto;

/**
 * The deployed contracts, from the committed deployment record. Public, so the page can list them even with the server
 * down; whether each one is verified on Snowtrace is only known once the server has asked.
 */
export const DEPLOYED_CONTRACTS: Proof["contracts"] = [
  { name: "AgentPolicyModule", address: FUJI_DEPLOYMENT.publicModule, verified: false, explorerUrl: explorerAddressUrl(FUJI_DEPLOYMENT.publicModule) },
  { name: "AgentShieldFactory", address: FUJI_DEPLOYMENT.factory, verified: false, explorerUrl: explorerAddressUrl(FUJI_DEPLOYMENT.factory) },
  { name: "MockUSDC", address: FUJI_DEPLOYMENT.usdc, verified: false, explorerUrl: explorerAddressUrl(FUJI_DEPLOYMENT.usdc) },
  { name: "MockWAVAX", address: FUJI_DEPLOYMENT.wavax, verified: false, explorerUrl: explorerAddressUrl(FUJI_DEPLOYMENT.wavax) },
];

export type ProofView =
  | { status: "loading" }
  /** The server did not answer: only the deployment record is shown, never made-up numbers. */
  | { status: "offline"; contracts: Proof["contracts"] }
  | { status: "ready"; proof: Proof };

/** GET /proof. Every number on the page comes from here; nothing is filled in when it is missing. */
export function useProof(): ProofView {
  const q = useQuery({ queryKey: ["proof"], queryFn: ({ signal }) => apiRequest("/proof", ProofDto, { signal }), staleTime: 30_000 });
  if (q.data) return { status: "ready", proof: q.data };
  if (q.isError) return { status: "offline", contracts: DEPLOYED_CONTRACTS };
  return { status: "loading" };
}

/** The contract suite has not produced its artifact yet (server's TESTS_NOT_RUN): "not run", not "failing". */
export const testsNotRun = (t: Proof["tests"]): boolean => t.fuzzRuns === 0 && t.invariants.length === 0;

export { useCountUp } from "@/shared/lib/useCountUp";
export { useReducedMotion } from "@/shared/lib/useReducedMotion";

export const shortHash = (h: string): string => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h);

export function formatUtc(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 19).replace("T", " ")}Z`;
}

export const seconds = (ms: number): string => `${(ms / 1000).toFixed(2)}s`;
