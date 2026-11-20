import type { AgentAction, AgentFlag, AgentPlan } from "@agentshield/shared";
import { shortAddress } from "@/shared/lib/address";

/**
 * Display model for the Hijacked Agent's plan (JobDto.agentPlan). Pure, so the copy is unit-tested. The plan is what
 * the fooled AI wanted; the shields below it are what happened. Every dangerous value says why in words, never by
 * color alone.
 */

export const FLAG_COPY: Record<AgentFlag, string> = {
  "recipient-not-vault": "Proceeds to a stranger",
  "drains-vault": "Drains the vault",
  "over-cap": "Over the per-trade cap",
  "any-slippage": "At any price",
  "skips-auditor": "Skips the auditor",
  "approve-stranger": "Approves a stranger",
  "unlimited-approval": "Unlimited allowance",
};

const FALLBACK_COPY: Record<string, string> = {
  off: "no LLM configured",
  "rate-limit": "LLM busy",
  timeout: "LLM too slow",
  "invalid-output": "LLM answer unusable",
  error: "LLM error",
};

export interface PlanRow {
  label: string;
  value: string;
  /** Set when this value is what makes the plan dangerous: the reason, shown next to it. */
  danger: string | null;
}

export interface PlanView {
  /** "Swap", "Approve", "Direct call", "No action". */
  title: string;
  rows: PlanRow[];
  flags: { id: AgentFlag; text: string }[];
  /** "LLM · gemini-2.5-flash" or "Rules · LLM busy". */
  source: string;
  sourceIsLlm: boolean;
}

const TITLE: Record<AgentAction["type"], string> = { swap: "Swap", approve: "Approve", direct: "Direct call", none: "No action" };

const amountText = (amount: string, token: string) => (amount === "all" ? `All the ${token}` : `${amount} ${token}`);

export function planView(plan: AgentPlan): PlanView {
  const has = (f: AgentFlag) => plan.flags.includes(f);
  const flag = (...fs: AgentFlag[]) => fs.filter(has).map((f) => FLAG_COPY[f]).join(" · ") || null;
  const a = plan.action;
  let rows: PlanRow[];
  switch (a.type) {
    case "swap":
      rows = [
        { label: "Spend", value: amountText(a.amount, a.tokenIn), danger: flag("drains-vault", "over-cap") },
        { label: "Buy", value: a.tokenOut, danger: null },
        { label: "Send proceeds to", value: a.recipient === "vault" ? "The vault" : shortAddress(a.recipient), danger: flag("recipient-not-vault") },
        { label: "Max slippage", value: a.maxSlippagePct >= 100 ? "Any price" : `${a.maxSlippagePct}%`, danger: flag("any-slippage") },
      ];
      break;
    case "approve":
      rows = [
        { label: "Token", value: a.token, danger: null },
        { label: "Spender", value: shortAddress(a.spender), danger: flag("approve-stranger") },
        { label: "Allowance", value: a.amount === "unlimited" ? "Unlimited" : `${a.amount} ${a.token}`, danger: flag("unlimited-approval") },
      ];
      break;
    case "direct":
      rows = [
        { label: "Route", value: "Straight to the contract", danger: flag("skips-auditor") },
        { label: "Spend", value: amountText(a.amount, a.tokenIn), danger: flag("drains-vault", "over-cap") },
        { label: "Buy", value: a.tokenOut, danger: null },
      ];
      break;
    case "none":
      rows = [{ label: "Action", value: "None: the agent holds", danger: null }];
      break;
  }
  return {
    title: TITLE[a.type],
    rows,
    flags: plan.flags.map((id) => ({ id, text: FLAG_COPY[id] })),
    source: plan.source === "llm" ? `LLM · ${plan.model ?? "model"}` : `Rules · ${FALLBACK_COPY[plan.fallbackReason ?? ""] ?? "keyword planner"}`,
    sourceIsLlm: plan.source === "llm",
  };
}
