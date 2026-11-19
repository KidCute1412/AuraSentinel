import { describe, expect, it } from "vitest";
import type { CheckRow, JobDetailDto, StateDto } from "@agentshield/shared";
import { measuredChange } from "./measuredChange";

const USDC = "0x3333333333333333333333333333333333333333" as const;
const WAVAX = "0x4444444444444444444444444444444444444444" as const;
const amt = (token: `0x${string}`, amount: string, symbol: string, decimals: number) => ({ type: "amount" as const, amount, token, symbol, decimals });
const row = (id: string, actual: CheckRow["actual"]): CheckRow => ({ id, pass: true, reasonCode: null, actual, limit: null });

const state = {
  balances: [
    { token: USDC, symbol: "USDC", decimals: 6, amount: "700000000" },
    { token: WAVAX, symbol: "WAVAX", decimals: 18, amount: "9" },
  ],
} as unknown as StateDto;

const job = (status: JobDetailDto["status"], checks: CheckRow[]) =>
  ({ id: "j1", status, audit: [{ shield: "onchain", result: "pass", reason: null, ts: "2026-11-19T00:00:00.000Z", checks }] }) as unknown as JobDetailDto;

const measured = [
  row("tx-sent", { type: "text", value: "0xabc" }),
  row("chain-paid", amt(USDC, "-200000000", "USDC", 6)),
  row("chain-balance", amt(USDC, "800000000", "USDC", 6)),
  row("chain-received", amt(WAVAX, "5", "WAVAX", 18)),
  row("chain-balance", amt(WAVAX, "7", "WAVAX", 18)),
];

describe("measuredChange", () => {
  it("builds before = after − flow from the measured Shield 2 rows, not from the current balance", () => {
    const c = measuredChange(job("confirmed", measured), state);
    expect(c?.after.map((b) => b.amount)).toEqual(["800000000", "7"]);
    expect(c?.before.map((b) => b.amount)).toEqual(["1000000000", "2"]);
  });

  it("gives no comparison for jobs without measured rows, unconfirmed jobs, or a missing balance", () => {
    expect(measuredChange(job("confirmed", measured.slice(0, 1)), state)).toBeNull();
    expect(measuredChange(job("reverted", measured), state)).toBeNull();
    expect(measuredChange(job("confirmed", measured.slice(0, 4)), state)).toBeNull();
    expect(measuredChange(undefined, state)).toBeNull();
  });
});
