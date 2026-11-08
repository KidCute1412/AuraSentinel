import type { Address, JobDetailDto } from "@agentshield/shared";
import { sameAddress } from "@/shared/lib/address";

export interface TourStep {
  id: "rebalance" | "over-withdraw" | "bypass" | "kill";
  title: string;
  hint: string;
  done: boolean;
}

/**
 * Progress of the 4-step guided tour on /demo. Derived from what the visitor actually did in this visit
 * (jobs created since `sinceMs`), so it is always honest and survives re-renders.
 */
export function tourProgress(jobs: readonly JobDetailDto[], safe: Address, sinceMs: number, killedThisVisit: boolean): TourStep[] {
  const mine = jobs.filter((j) => Date.parse(j.createdAt) >= sinceMs);
  const rebalance = mine.some((j) => j.kind === "swap" && j.status === "confirmed");
  const overWithdraw = mine.some(
    (j) => j.origin === "redteam" && j.status === "rejected" && j.reasonCode === "ExceedsPerTxCap" && !!j.intent && sameAddress(j.intent.recipient, safe),
  );
  const bypass = mine.some((j) => j.origin === "redteam" && j.status === "reverted");
  return [
    { id: "rebalance", title: "Run a safe rebalance", hint: "A valid trade inside the limits goes through.", done: rebalance },
    { id: "over-withdraw", title: "Try to over-withdraw", hint: "Shield 1 stops it before anything is signed.", done: overWithdraw },
    { id: "bypass", title: "Bypass the website", hint: "Skip Shield 1 entirely. The contract still says no.", done: bypass },
    { id: "kill", title: "Pull the Kill-Switch", hint: "One signature locks the agent out.", done: killedThisVisit },
  ];
}
