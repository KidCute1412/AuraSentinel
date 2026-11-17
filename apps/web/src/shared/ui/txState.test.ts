import { describe, expect, it } from "vitest";
import { describeTxError, isBusy, isUserRejection, txInitial, txReduce, UserFacingError, type TxPhase } from "./txState";

const run = (...actions: Parameters<typeof txReduce>[1][]): TxPhase => actions.reduce(txReduce, txInitial as TxPhase);

describe("txReduce", () => {
  it("walks idle -> signing -> pending -> confirmed and measures broadcast -> receipt", () => {
    const end = run({ type: "submit", now: 1000 }, { type: "signed", hash: "0xabc", now: 1200 }, { type: "confirmed", now: 2500 });
    expect(end).toEqual({ kind: "confirmed", ms: 1300, hash: "0xabc" });
  });

  it("ignores a second submit while busy", () => {
    const mid = run({ type: "submit", now: 1 }, { type: "submit", now: 99 });
    expect(mid).toEqual({ kind: "signing", startedAt: 1 });
    expect(isBusy(mid)).toBe(true);
  });

  it("returns to idle (not error) when the user rejects in the wallet", () => {
    expect(run({ type: "submit", now: 1 }, { type: "rejected" })).toEqual(txInitial);
  });

  it("surfaces a failure only while a tx is in flight", () => {
    expect(run({ type: "failed", message: "x" })).toEqual(txInitial);
    expect(run({ type: "submit", now: 1 }, { type: "signed", hash: "0x1", now: 2 }, { type: "failed", message: "boom" })).toEqual({ kind: "error", message: "boom" });
  });

  it("allows retry after an error", () => {
    const err = run({ type: "submit", now: 1 }, { type: "failed", message: "boom" });
    expect(txReduce(err, { type: "submit", now: 5 })).toEqual({ kind: "signing", startedAt: 5 });
  });

  it("does not go backwards on out-of-order events", () => {
    expect(run({ type: "confirmed", now: 5 })).toEqual(txInitial);
    expect(run({ type: "signed", hash: "0x1", now: 2 })).toEqual(txInitial);
  });
});

describe("error helpers", () => {
  it("recognises wallet rejections", () => {
    expect(isUserRejection({ code: 4001 })).toBe(true);
    expect(isUserRejection({ name: "UserRejectedRequestError" })).toBe(true);
    expect(isUserRejection(new Error("User rejected the request."))).toBe(true);
    expect(isUserRejection(new Error("execution reverted"))).toBe(false);
    expect(isUserRejection(null)).toBe(false);
  });

  it("describes revert reasons and unknown failures", () => {
    expect(describeTxError({ reason: "ExceedsPerTxCap" })).toContain("ExceedsPerTxCap");
    expect(describeTxError(new Error("x"))).toMatch(/failed/);
  });

  it("turns owner-call reverts and wallet problems into plain English", () => {
    expect(describeTxError({ reason: "NotOwner" })).toMatch(/Only the vault owner/);
    expect(describeTxError({ reason: "InvalidPolicy" })).toMatch(/rejected this policy/);
    expect(describeTxError({ reason: "ModuleExists" })).toMatch(/already has a guard module/);
    expect(describeTxError({ reason: "GS026" })).toMatch(/Only its owner/);
    expect(describeTxError({ reason: "FaucetCooldown" })).toMatch(/faucet timer/);
    expect(describeTxError(new UserFacingError("Deploy the module first."))).toBe("Deploy the module first.");
    expect(describeTxError(new Error("Connect your wallet first."))).toBe("Connect your wallet first.");
    expect(describeTxError(new Error("insufficient funds for gas * price + value"))).toMatch(/enough AVAX/);
  });
});
