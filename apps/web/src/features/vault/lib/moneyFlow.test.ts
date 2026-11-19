import { describe, expect, it } from "vitest";
import type { CheckRow } from "@agentshield/shared";
import { moneyFlow } from "./moneyFlow";

const USDC = "0x3333333333333333333333333333333333333333" as const;
const WAVAX = "0x4444444444444444444444444444444444444444" as const;
const SAFE = "0x1111111111111111111111111111111111111111" as const;
const STRANGER = "0x9999999999999999999999999999999999999999" as const;
const usdc = (amount: string) => ({ type: "amount" as const, amount, token: USDC, symbol: "USDC", decimals: 6 });
const wavax = (amount: string) => ({ type: "amount" as const, amount, token: WAVAX, symbol: "WAVAX", decimals: 18 });
const row = (id: string, actual: CheckRow["actual"], pass = true, limit: CheckRow["limit"] = null): CheckRow => ({ id, pass, reasonCode: pass ? null : "X", actual, limit });

describe("moneyFlow", () => {
  it("reads the rehearsal flows from the simulation rows", () => {
    const f = moneyFlow("simulation", [row("sim-executes", null), row("sim-token-in", usdc("-200000000")), row("sim-token-out", wavax("5"))]);
    expect(f).toMatchObject({ source: "rehearsal", paid: { amount: "-200000000" }, received: { amount: "5" }, others: null, redirect: null });
  });

  it("adds what anyone else gained at the invariants gate", () => {
    const f = moneyFlow("invariant", [row("inv-output", wavax("5")), row("inv-input", usdc("-200000000")), row("inv-attacker", wavax("0"))]);
    expect(f?.others).toEqual({ value: wavax("0"), ok: true });
  });

  it("uses the measured rows for the on-chain gate, and nothing for a revert", () => {
    expect(moneyFlow("onchain", [row("chain-paid", usdc("-200000000")), row("chain-received", wavax("5"))])?.source).toBe("chain");
    expect(moneyFlow("onchain", [row("tx-result", { type: "text", value: "GS104" }, false)])).toBeNull();
  });

  it("draws the redirect only when the pre-check caught a stranger recipient", () => {
    expect(moneyFlow("precheck", [row("recipient", { type: "address", value: STRANGER }, false, { type: "address", value: SAFE })])?.redirect).toBe(STRANGER);
    expect(moneyFlow("precheck", [row("recipient", { type: "address", value: SAFE }, true)])).toBeNull();
    expect(moneyFlow("precheck", [row("per-trade-cap", usdc("2000000000"), false)])).toBeNull();
  });
});
