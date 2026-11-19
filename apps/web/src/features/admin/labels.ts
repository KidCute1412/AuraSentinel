import type { CheckStatus } from "@agentshield/shared";

/** Why the rebalancer left a vault alone on its last tick, in words (server: rebalancer.processor TickSkip). */
const SKIP_REASONS: Record<string, string> = {
  "demo-vault": "Public demo vault: visitors drive it",
  "policy-inactive": "Kill-Switch is on",
  "policy-expired": "Policy expired",
  "pair-not-whitelisted": "USDC/WAVAX pair not allowed by its policy",
  "pending-swap": "A swap is still pending",
  "no-quote": "No price quote from the DEX",
  balanced: "Already balanced",
  "vault-limit": "Over REBALANCE_MAX_VAULTS",
  "not-a-vault": "Not an AuraSentinel vault",
  "read-failed": "Could not read it from the chain",
  "no-quote-for-amount": "Quote too small for the amount",
  duplicate: "Already queued this block window",
  "enqueue-failed": "Could not queue the swap",
};

export const skipReason = (reason: string): string => SKIP_REASONS[reason] ?? reason;

/** Overall preflight verdict: the Stamp's tone and word. */
export const VERDICT: Record<CheckStatus, { tone: "ok" | "warn" | "danger"; label: string }> = {
  ok: { tone: "ok", label: "Ready" },
  warn: { tone: "warn", label: "Check" },
  fail: { tone: "danger", label: "Not ready" },
};

/** 892857142 -> "893M": a swap count can be huge on a quiet testnet. */
export const compactCount = (n: number): string => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** Milliseconds as seconds with one decimal: 1834 -> "1.8 s". */
export const seconds = (ms: number): string => `${(ms / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
