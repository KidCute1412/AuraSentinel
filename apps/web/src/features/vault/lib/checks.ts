import type { CheckRow, CheckValue } from "@agentshield/shared";
import { shortAddress } from "@/shared/lib/address";
import { formatTokenAmount } from "@/shared/lib/format";
import type { StepId } from "./timeline";

/** What each gate does, in one sentence a newcomer understands. */
export const GATE_INFO: Record<StepId, { title: string; where: string; what: string }> = {
  precheck: { title: "Pre-check", where: "Shield 1 · our server", what: "Compares the trade with the vault's policy, read live from the blockchain." },
  simulation: { title: "Simulation", where: "Shield 1 · our server", what: "Runs the trade on a private copy of the blockchain first, to see what it would really do." },
  invariant: { title: "Invariants", where: "Shield 1 · our server", what: "Checks where the money went in that rehearsal: it may change form, never leave the vault." },
  onchain: { title: "On-chain policy", where: "Shield 2 · the contract", what: "The smart contract re-checks every rule itself. Nobody, not even our server, can skip it." },
};

/**
 * Each rule in words. `op` sits between what the trade had and what the rule allows ("2,000 USDC ≤ 500 USDC").
 * Unknown ids (a newer server) fall back to the id itself.
 */
const RULES: Record<string, { label: string; op?: string }> = {
  "agent-signer": { label: "Signed by the vault's own agent", op: "=" },
  "kill-switch": { label: "Kill-Switch is off" },
  "policy-expiry": { label: "Policy has not expired", op: "before" },
  "tokens-allowed": { label: "Both tokens are allowed" },
  "different-tokens": { label: "Swaps two different tokens" },
  "per-trade-cap": { label: "Per-trade cap", op: "≤" },
  "daily-cap": { label: "Daily cap: spent today + this trade", op: "≤" },
  "min-out": { label: "Asks for a minimum amount back" },
  recipient: { label: "Proceeds go back to the vault", op: "=" },
  "sim-executes": { label: "Trade runs on the copy" },
  "sim-token-in": { label: "Vault pays" },
  "sim-token-out": { label: "Vault receives" },
  "inv-output": { label: "Vault received tokens", op: "" },
  "inv-input": { label: "Vault paid exactly the trade amount", op: "=" },
  "inv-attacker": { label: "Nobody else gained anything", op: "=" },
  "inv-allowance": { label: "No spending approval left behind", op: "=" },
  "tx-sent": { label: "Transaction sent" },
  "tx-block": { label: "Included in block" },
  "tx-result": { label: "Contract accepted it" },
};

export const ruleLabel = (id: string): string => RULES[id]?.label ?? id;
export const ruleOp = (id: string): string | undefined => RULES[id]?.op;

/** A rule value for display: en-US numbers, short addresses, dates. Money is formatted here only (P5). */
export function formatValue(v: CheckValue | null): string {
  if (!v) return "";
  switch (v.type) {
    case "amount":
      return `${formatTokenAmount(BigInt(v.amount), v.decimals, v.decimals > 6 ? 4 : 2)} ${v.symbol}`;
    case "address":
      return shortAddress(v.value);
    case "bool":
      return v.value ? "armed" : "killed";
    case "time":
      return new Date(v.unix * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    case "text":
      return v.value;
  }
}

/** Spent today, this trade and the cap, for the daily-cap bar. Null unless the row carries all three amounts. */
export function dailyBar(row: CheckRow, amountIn: string | undefined): { spent: bigint; trade: bigint; cap: bigint; decimals: number; symbol: string } | null {
  if (row.id !== "daily-cap" || row.actual?.type !== "amount" || row.limit?.type !== "amount" || !amountIn) return null;
  const total = BigInt(row.actual.amount);
  const trade = BigInt(amountIn);
  return { spent: total > trade ? total - trade : 0n, trade, cap: BigInt(row.limit.amount), decimals: row.actual.decimals, symbol: row.actual.symbol };
}
