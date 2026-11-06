export type NodeId = "agent" | "shield1" | "shield2" | "vault";

/** Left-to-right order of the diagram. */
export const NODES: readonly NodeId[] = ["agent", "shield1", "shield2", "vault"];

export type ScenarioId = "valid" | "drain" | "approval" | "direct";

export interface Scenario {
  id: ScenarioId;
  label: string;
  hint: string;
  /** Where the transaction dies, or null when it is approved. */
  blockedAt: "shield1" | "shield2" | null;
  /** Nodes the packet flies past without being checked (the attacker skips the website). */
  skips?: NodeId[];
  code: string;
  explanation: string;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "valid",
    label: "Valid swap",
    hint: "50 USDC to AVAX",
    blockedAt: null,
    code: "APPROVED",
    explanation: "Inside the whitelist and the daily cap, and the proceeds go back to the vault. Both shields say yes, so the trade executes.",
  },
  {
    id: "drain",
    label: "Drain 2,000 USDC",
    hint: "send to a stranger",
    blockedAt: "shield1",
    code: "ExceedsPerTxCap",
    explanation: "The auditor simulates the transfer on a forked chain and sees it exceeds the per-transaction cap. No signature is ever produced.",
  },
  {
    id: "approval",
    label: "Unlimited approval",
    hint: "approve MAX_UINT256",
    blockedAt: "shield1",
    code: "UnlimitedApproval",
    explanation: "An unlimited allowance would let a router pull every token later. The auditor rejects it before anything is signed.",
  },
  {
    id: "direct",
    label: "Skip the website",
    hint: "call the chain directly",
    blockedAt: "shield2",
    skips: ["shield1"],
    code: "reverted on-chain",
    explanation: "The attacker bypasses the web app, so the auditor never sees it. The policy contract still reverts the call: the rules live on-chain, not in our server.",
  },
];

export interface RouteResult {
  /** Nodes the packet visits, in order. The last one is where it stops. */
  path: NodeId[];
  stopsAt: NodeId;
  verdict: "approved" | "blocked";
  skipped: NodeId[];
  code: string;
  explanation: string;
  /** Which shield made the call, for the explanation panel. */
  decidedBy: "Shield 1 · AI Auditor" | "Shield 2 · Policy contract" | "Both shields";
}

export function route(s: Scenario): RouteResult {
  const end = s.blockedAt ? NODES.indexOf(s.blockedAt) : NODES.length - 1;
  const path = NODES.slice(0, end + 1);
  return {
    path,
    stopsAt: path[path.length - 1],
    verdict: s.blockedAt ? "blocked" : "approved",
    skipped: s.skips ?? [],
    code: s.code,
    explanation: s.explanation,
    decidedBy: s.blockedAt === "shield1" ? "Shield 1 · AI Auditor" : s.blockedAt === "shield2" ? "Shield 2 · Policy contract" : "Both shields",
  };
}

export const scenarioById = (id: ScenarioId): Scenario => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
