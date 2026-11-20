import type { Address, JobDto } from "@agentshield/shared";
import { sameAddress } from "@/shared/lib/address";

export interface TourStep {
  id: "rebalance" | "over-withdraw" | "hijack" | "bypass" | "kill";
  title: string;
  hint: string;
  done: boolean;
}

/**
 * Progress of the 5-step guided tour on /demo. Derived from what the visitor actually did in this visit
 * (jobs created since `sinceMs`), so it is always honest and survives re-renders.
 */
export function tourProgress(jobs: readonly JobDto[], safe: Address, sinceMs: number, killedThisVisit: boolean): TourStep[] {
  const mine = jobs.filter((j) => Date.parse(j.createdAt) >= sinceMs);
  const rebalance = mine.some((j) => j.kind === "swap" && j.status === "confirmed");
  const overWithdraw = mine.some(
    (j) => j.origin === "redteam" && j.status === "rejected" && j.reasonCode === "ExceedsPerTxCap" && !!j.intent && sameAddress(j.intent.recipient, safe),
  );
  // A Hijacked Agent run that the shields answered: blocked, or held inside the policy.
  const hijack = mine.some((j) => !!j.agentPlan && (j.status === "rejected" || j.status === "reverted" || j.status === "held"));
  const bypass = mine.some((j) => j.origin === "redteam" && j.status === "reverted" && !j.agentPlan);
  return [
    { id: "rebalance", title: "Run a safe rebalance", hint: "A valid trade inside the limits goes through.", done: rebalance },
    { id: "over-withdraw", title: "Try to over-withdraw", hint: "Shield 1 stops it before anything is signed.", done: overWithdraw },
    { id: "hijack", title: "Hijack the AI", hint: "Fool the agent's AI with a fake message. The shields still refuse its plan.", done: hijack },
    { id: "bypass", title: "Bypass the website", hint: "Skip Shield 1 entirely. The contract still says no.", done: bypass },
    { id: "kill", title: "Pull the Kill-Switch", hint: "One signature locks the agent out.", done: killedThisVisit },
  ];
}
