import { fromAmount, TOKEN_DECIMALS, type AgentToken, type JobDto } from "@agentshield/shared";
import { formatTokenAmount } from "./format";

type Labelled = Pick<JobDto, "intent" | "origin"> & Partial<Pick<JobDto, "kind" | "agentPlan">>;

/**
 * The token a job spends: USDC for every server-built trade, and for a Hijacked Agent run the token its plan named
 * (it may sell WAVAX). Display only.
 */
function spentToken(j: Labelled): AgentToken {
  const a = j.agentPlan?.action;
  return a && (a.type === "swap" || a.type === "direct") ? a.tokenIn : "USDC";
}

/** "2,000 USDC", "10 WAVAX", or null when the job moves no amount. */
export function amountLabel(j: Labelled): string | null {
  if (!j.intent || j.intent.amountIn === "0") return null;
  const token = spentToken(j);
  return `${formatTokenAmount(fromAmount(j.intent.amountIn), TOKEN_DECIMALS[token])} ${token}`;
}

const ACTION: Record<string, string> = { swap: "swap", approve: "approval", direct: "direct call", none: "no action" };

/** What a job was, in one line: "Attack · 2,000 USDC", "Rebalance · 200 USDC", "Hijack · approval". Same wording on every list. */
export function jobLabel(j: Labelled): string {
  const amount = amountLabel(j);
  if (j.agentPlan) return `Hijack · ${amount ?? ACTION[j.agentPlan.action.type]}`;
  const tail = amount ? ` · ${amount}` : "";
  if (j.kind === "attack" || j.origin === "redteam") return `Attack${tail}`;
  return `${j.origin === "rebalancer" ? "Auto rebalance" : "Rebalance"}${tail}`;
}
