import { describe, expect, it } from "vitest";
import { state } from "@/test/apiFixtures";
import { doneSteps, firstOpenStep, GUIDED_STEPS, checkTradeAmount, normalTradeAmount, stepFor, stepResult } from "./guided";

const job = (status: string, reasonCode: string | null = null, revertError: string | null = null) => ({ status, reasonCode, revertError }) as never;

describe("guided demo steps", () => {
  it("has the four tour steps in order, only the last one without a server job", () => {
    expect(GUIDED_STEPS.map((s) => s.id)).toEqual(["rebalance", "over-withdraw", "bypass", "kill"]);
    expect(GUIDED_STEPS.map((s) => s.spec === null)).toEqual([false, false, false, true]);
  });

  it("no job yet is idle, a job still in the pipeline is running", () => {
    expect(stepResult("rebalance", undefined).kind).toBe("idle");
    expect(stepResult("rebalance", job("auditing")).kind).toBe("running");
  });

  it("a confirmed normal trade passes as Approved; a blocked one is said plainly, never as a pass", () => {
    expect(stepResult("rebalance", job("confirmed"))).toMatchObject({ kind: "pass", tone: "ok", stamp: "Approved" });
    expect(stepResult("rebalance", job("rejected", "ExceedsDailyCap"))).toMatchObject({ kind: "other" });
  });

  it("attacks pass only when blocked; the expected shield gets its own wording", () => {
    expect(stepResult("over-withdraw", job("rejected", "ExceedsPerTxCap"))).toMatchObject({ kind: "pass", tone: "danger", headline: "Blocked before anything was signed." });
    expect(stepResult("bypass", job("reverted", null, "ExceedsPerTxCap"))).toMatchObject({ kind: "pass", headline: "Blocked by the contract on the blockchain." });
    expect(stepResult("over-withdraw", job("rejected", "PolicyInactive"))).toMatchObject({ kind: "pass", headline: "Blocked, by another rule." });
    expect(stepResult("bypass", job("confirmed"))).toMatchObject({ kind: "other", headline: "Not blocked" });
  });

  it("an infrastructure failure is never shown as a verdict", () => {
    expect(stepResult("over-withdraw", job("failed"))).toMatchObject({ kind: "other", headline: "Something broke on our side" });
  });

  it("done = passed here or done this visit anywhere on the page; the open step is the first not done", () => {
    const tour = [
      { id: "rebalance", done: true },
      { id: "over-withdraw", done: false },
      { id: "bypass", done: false },
      { id: "kill", done: false },
    ] as never;
    const done = doneSteps(tour, new Set(["bypass"]));
    expect([...done].sort()).toEqual(["bypass", "rebalance"]);
    expect(firstOpenStep(done)).toBe(1);
    expect(firstOpenStep(new Set(["rebalance", "over-withdraw", "bypass", "kill"]))).toBe(3);
  });

  it("sizes the normal trade to 20 USDC, or what is left of today's limit, in whole USDC", () => {
    const spent = (amount: string) => ({ ...state, spentToday: state.spentToday.map((s) => ({ ...s, amount })) });
    expect(normalTradeAmount(state)).toBe(20_000_000n); // plenty left
    expect(normalTradeAmount(spent("1485500000"))).toBe(14_000_000n); // 14.5 left -> 14
    expect(normalTradeAmount(spent("1500000000"))).toBe(20_000_000n); // nothing left: blocked, said plainly
    expect(normalTradeAmount(null)).toBe(20_000_000n);
    const step = stepFor(GUIDED_STEPS[0]!, spent("1485500000"));
    expect(step.story).toContain("14 USDC");
    expect(step.spec).toEqual({ type: "rebalance", amountIn: 14_000_000n });
  });

  it("lets the visitor pick 1 to 100 USDC, within what the shared vault has left today", () => {
    const spent = (amount: string) => ({ ...state, spentToday: state.spentToday.map((s) => ({ ...s, amount })) });
    expect(checkTradeAmount("35", state)).toEqual({ value: 35_000_000n });
    expect(checkTradeAmount("100", state)).toEqual({ value: 100_000_000n });
    expect(checkTradeAmount("101", state)).toEqual({ error: "At most 100 USDC on this shared demo vault" });
    expect(checkTradeAmount("0.5", state)).toEqual({ error: "At least 1 USDC" });
    expect(checkTradeAmount("abc", state)).toHaveProperty("error");
    expect(checkTradeAmount("60", spent("1450000000"))).toEqual({ error: "Only 50 USDC left today on this shared vault" });
    const step = stepFor(GUIDED_STEPS[0]!, state, 35_000_000n);
    expect(step.story).toContain("35 USDC");
    expect(step.spec).toEqual({ type: "rebalance", amountIn: 35_000_000n });
  });
});
