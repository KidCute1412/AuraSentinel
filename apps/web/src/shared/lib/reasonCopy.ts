import { reasonPlaceholders, toReasonCode, type ReasonCode, type ReasonParams } from "@agentshield/shared";

/**
 * English UI copy for every reason code. `REASONS` in @agentshield/shared keeps the Vietnamese
 * explainer copy (`messageVi`); the web shows English only (design-system: copy), so it reads this table.
 * `Record<ReasonCode, ...>` makes a new code a type error until it has an entry here.
 *
 * Templates use the same {placeholders} as the shared `messageVi`, filled with already formatted
 * values; any template with placeholders has a number-free `fallback` for when a value is missing.
 */
export interface ReasonCopy {
  /** Short label for chips, stamps and timeline rows. No numbers. */
  title: string;
  message: string;
  fallback?: string;
}

export const REASON_COPY: Record<ReasonCode, ReasonCopy> = {
  // Gate 1: who and when
  UnauthorizedAgent: {
    title: "Wrong agent wallet",
    message: "The order was not signed by the agent wallet the owner approved, so it was refused. No funds left the vault.",
  },
  PolicyInactive: {
    title: "Policy is not active",
    message: "The agent is locked by the Kill-Switch. Every order is blocked until the owner signs a re-activation.",
  },
  PolicyExpired: {
    title: "Policy expired",
    message: "The agent's trading permission expired at {expiry}. The owner must sign a new policy for the agent to continue.",
    fallback: "The agent's trading permission has expired. The owner must sign a new policy for the agent to continue.",
  },
  // Gate 2: which tokens
  TokenNotWhitelisted: {
    title: "Token not allowed",
    message: "Token {token} is not on the list the owner allows the agent to trade.",
    fallback: "This token is not on the list the owner allows the agent to trade.",
  },
  SameToken: {
    title: "Same token on both sides",
    message: "The token sold and the token bought are the same, so the order is invalid.",
  },
  // Gate 3-4: how much
  ExceedsPerTxCap: {
    title: "Over the per-transaction cap",
    message: "The {amount} order is over the per-transaction cap of {maxPerTx}.",
    fallback: "The order is larger than the most the agent may move in one transaction.",
  },
  ExceedsDailyCap: {
    title: "Over the daily cap",
    message: "{spent} of the {dailyCap} daily cap is already used. Another {amount} would go over it.",
    fallback: "This order would push today's total spending past the daily cap.",
  },
  ZeroMinOut: {
    title: "No minimum output",
    message: "The order sets no minimum output (minOut = 0), which leaves it open to price manipulation. Blocked.",
  },
  DeadlineTooFar: {
    title: "Deadline too far",
    message: "The order's deadline is more than 10 minutes away. Blocked so it cannot be held back and filled at a bad price.",
  },
  // Gate 5: execution
  SwapFailed: {
    title: "Swap refused by the DEX",
    message: "The exchange refused the swap. The transaction was rolled back and no funds left the vault.",
  },
  InsufficientOutput: {
    title: "Output too low",
    message: "The amount received is below the minimum of {minOut}. The order was cancelled to avoid slippage.",
    fallback: "The amount received is below the minimum. The order was cancelled to avoid slippage.",
  },
  ResidualAllowance: {
    title: "Allowance left after swap",
    message: "A spending allowance was still open after the swap. The order was cancelled so nobody can pull more from the vault.",
  },

  // Owner functions and the reentrancy guard (a wallet signed a bad owner transaction).
  NotOwner: {
    title: "Not the vault owner",
    message: "Only the owner wallet can change the policy or use the Kill-Switch. Transaction refused.",
  },
  InvalidPolicy: {
    title: "Invalid policy",
    message: "Policy refused: the agent or router address is empty, the expiry has passed, or a token cap is invalid.",
  },
  Reentrancy: {
    title: "Reentrant call",
    message: "The module refused a nested call during the swap. No funds left the vault.",
  },
  // Factory (wizard /vaults/new)
  NotSafeOwner: {
    title: "Not a Safe owner",
    message: "Only an owner of this Safe can create a guard module for it. Request refused.",
  },
  ModuleExists: {
    title: "Safe already guarded",
    message: "This Safe already has a guard module, so creating another one was refused.",
  },

  // Safe core
  GS104: {
    title: "Refused by the Safe (GS104)",
    message:
      "The caller is not a module enabled on the vault, so the Safe refused the call (GS104). The agent cannot grant itself an allowance.",
  },

  // Off-chain intent check (the module ABI has no recipient field).
  RECIPIENT_NOT_SAFE: {
    title: "Recipient is not the vault",
    message: "The order tried to send funds to {recipient} instead of the vault. On-chain, the recipient is always locked to the vault.",
    fallback: "The order tried to send funds out of the vault. On-chain, the recipient is always locked to the vault.",
  },

  // Post-simulation invariants
  INVARIANT_NO_OUTPUT: {
    title: "Vault received nothing",
    message: "The simulation shows the vault did not receive the token it bought. Blocked before sending.",
  },
  INVARIANT_INPUT_MISMATCH: {
    title: "Wrong amount left the vault",
    message: "The simulation shows the vault lost {actual} instead of exactly {amount}. Blocked before sending.",
    fallback: "The simulation shows a different amount leaving the vault than the order states. Blocked before sending.",
  },
  INVARIANT_ATTACKER_GAINED: {
    title: "Unknown wallet gained funds",
    message: "The simulation shows an unknown wallet receiving funds. Blocked before sending.",
  },
  INVARIANT_ALLOWANCE_LEFT: {
    title: "Allowance left after simulation",
    message: "The simulation shows a spending allowance still open after the swap. Blocked before sending.",
  },

  UNKNOWN_REVERT: {
    title: "Unknown error",
    message: "The order was refused for a reason we could not identify. No funds left the vault.",
  },
};

/** Short English label for any code; unknown codes map to UNKNOWN_REVERT. */
export const reasonTitle = (code: unknown): string => REASON_COPY[toReasonCode(code)].title;

/**
 * English sentence for a reason code. Never throws: an unknown code falls back to UNKNOWN_REVERT,
 * a missing value to the number-free sentence.
 */
export function formatReason(code: unknown, params: ReasonParams = {}): string {
  const entry = REASON_COPY[toReasonCode(code)];
  const values = params as Record<string, string | undefined>;
  if (reasonPlaceholders(entry.message).some((name) => !values[name])) return entry.fallback ?? entry.message;
  return entry.message.replace(/\{(\w+)\}/g, (_, name: string) => values[name] as string);
}
