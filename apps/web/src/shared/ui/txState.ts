/** State machine behind TxButton. Pure, so every transition is unit-tested without a wallet. */
export type TxPhase =
  | { kind: "idle" }
  | { kind: "signing"; startedAt: number }
  | { kind: "pending"; startedAt: number; hash: string }
  | { kind: "confirmed"; ms: number; hash: string }
  | { kind: "error"; message: string };

export type TxAction =
  | { type: "submit"; now: number }
  | { type: "signed"; hash: string }
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
      return state.kind === "signing" ? { kind: "pending", startedAt: state.startedAt, hash: action.hash } : state;
    case "confirmed":
      return state.kind === "pending" ? { kind: "confirmed", ms: Math.max(0, action.now - state.startedAt), hash: state.hash } : state;
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

/**
 * English message for a failed tx. Real revert reasons arrive as codes; the code -> sentence table
 * lives in shared/errors.ts (AIE-owned), so unknown codes fall back to a generic line plus the code.
 */
export function describeTxError(err: unknown): string {
  const code = typeof err === "object" && err !== null && "reason" in err ? String((err as { reason?: unknown }).reason ?? "") : "";
  return code ? `Transaction reverted on-chain (${code}).` : "Transaction failed. Check your wallet and try again.";
}
