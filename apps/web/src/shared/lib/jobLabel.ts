import { fromAmount, type JobDto } from "@agentshield/shared";
import { formatTokenAmount } from "./format";

/** What a job was, in one line: "Attack · 2,000 USDC", "Rebalance · 200 USDC". Same wording on every list. */
export function jobLabel(j: Pick<JobDto, "intent" | "origin"> & Partial<Pick<JobDto, "kind">>): string {
  const amount = j.intent && j.intent.amountIn !== "0" ? ` · ${formatTokenAmount(fromAmount(j.intent.amountIn), 6)} USDC` : "";
  if (j.kind === "attack" || j.origin === "redteam") return `Attack${amount}`;
  return `${j.origin === "rebalancer" ? "Auto rebalance" : "Rebalance"}${amount}`;
}
