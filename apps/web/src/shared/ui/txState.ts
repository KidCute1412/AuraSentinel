/** State machine behind TxButton. Pure, so every transition is unit-tested without a wallet. */
export type TxPhase =
  | { kind: "idle" }
  | { kind: "signing"; startedAt: number }
  | { kind: "pending"; startedAt: number; sentAt: number; hash: string }
  | { kind: "confirmed"; ms: number; hash: string }
  | { kind: "error"; message: string };

export type TxAction =
  | { type: "submit"; now: number }
  /** `now` = the moment the signed tx left the wallet: confirmation time is measured from here. */
  | { type: "signed"; hash: string; now: number }
  | { type: "confirmed"; now: number }
  | { type: "failed"; message: string }
  | { type: "rejected" }
  | { type: "reset" };

export const txInitial: TxPhase = { kind: "idle" };

export function txReduce(state: TxPhase, action: TxAction): TxPhase {
  switch (action.type) {
    case "submit":
      // Ignore a second click while a tx is in flight.
      return state.kind === "signing" || state.kind === "pending" ? state : { kind: "signing", startedAt: action.now };
    case "signed":
      return state.kind === "signing" ? { kind: "pending", startedAt: state.startedAt, sentAt: action.now, hash: action.hash } : state;
    case "confirmed":
      // Broadcast -> receipt: how fast the chain locks it in, not how long the owner looked at the wallet popup.
      return state.kind === "pending" ? { kind: "confirmed", ms: Math.max(0, action.now - state.sentAt), hash: state.hash } : state;
    case "failed":
      return state.kind === "signing" || state.kind === "pending" ? { kind: "error", message: action.message } : state;
    case "rejected":
      // The user declining in the wallet is not an error: go back to idle, keep the screen calm.
      return state.kind === "signing" ? txInitial : state;
    case "reset":
      return txInitial;
  }
}

export const isBusy = (p: TxPhase): boolean => p.kind === "signing" || p.kind === "pending";

/** EIP-1193 code 4001 / viem UserRejectedRequestError / common wallet wording. */
export function isUserRejection(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; name?: unknown; message?: unknown };
  if (e.code === 4001 || e.code === "ACTION_REJECTED") return true;
  const text = `${String(e.name ?? "")} ${String(e.message ?? "")}`;
  return /user\s*(rejected|denied)|rejected the request|UserRejectedRequestError/i.test(text);
}

/** English copy for the reverts an owner call can hit (AgentPolicyModule custom errors). */
const OWNER_REVERT_COPY: Record<string, string> = {
  NotOwner: "Only the vault owner can do this. Switch your wallet to the owner account.",
  InvalidPolicy: "The chain rejected this policy. Check that every limit is above zero, per-transaction is at most the daily limit, and the expiry is in the future.",
};

/**
 * English message for a failed tx. A revert arrives with its custom error name in `reason`: known owner errors get a
 * plain sentence, anything else shows the code so it can be looked up.
 */
export function describeTxError(err: unknown): string {
  const code = typeof err === "object" && err !== null && "reason" in err ? String((err as { reason?: unknown }).reason ?? "") : "";
  if (code && OWNER_REVERT_COPY[code]) return OWNER_REVERT_COPY[code];
  if (code) return `Transaction reverted on-chain (${code}).`;
  const message = err instanceof Error ? err.message : "";
  if (/connect your wallet/i.test(message)) return "Connect your wallet first.";
  if (/insufficient funds/i.test(message)) return "Your wallet does not have enough AVAX for gas on Fuji.";
  return "Transaction failed. Check your wallet and try again.";
}
