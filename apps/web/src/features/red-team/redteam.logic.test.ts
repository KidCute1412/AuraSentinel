import { ATTACK_EXPECTATIONS, AttackScenario } from "@agentshield/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api";
import { REASON_COPY } from "@/shared/lib/reasonCopy";
import { job } from "@/test/apiFixtures";
import { describeApiError } from "./apiErrorCopy";
import { ATTACKS, DEMO_REBALANCE_AMOUNT, compareOutcome, expectationLabel } from "./attackCatalog";
import { useCountdown } from "./hooks/useCountdown";

describe("attack catalog", () => {
  it("covers the 4 button attacks once each, in demo order", () => {
    expect(ATTACKS.map((a) => a.scenario)).toEqual(AttackScenario.options.filter((s) => s !== "prompt-injection"));
    expect(ATTACKS.map((a) => a.index)).toEqual(["#1", "#2", "#3", "#4"]);
  });

  it("defaults the demo rebalance to 200 USDC in base units", () => {
    expect(DEMO_REBALANCE_AMOUNT).toBe("200000000");
  });

  // Labels are derived from ATTACK_EXPECTATIONS; the assertions are too, so a contract change
  // (e.g. the prompt-injection expectation) keeps the panel and these tests honest without edits.
  it.each(AttackScenario.options)("labels %s from ATTACK_EXPECTATIONS", (scenario) => {
    const e = ATTACK_EXPECTATIONS[scenario];
    const label = expectationLabel(scenario);
    const blocks = e.status === "rejected" || e.status === "reverted";
    if (e.stoppedBy === "llm-guard") {
      expect(label.startsWith("LLM has no authority")).toBe(true);
      expect(label.includes("still blocked")).toBe(blocks);
      return;
    }
    expect(label).toContain({ shield1: "Shield 1", shield2: "Shield 2", safe: "Safe" }[e.stoppedBy]);
    if (e.reasonCode) expect(label).toContain(REASON_COPY[e.reasonCode].title);
    expect(label.includes("Snowtrace link")).toBe(e.onchainEvidence);
  });
});

describe("compareOutcome", () => {
  it.each(AttackScenario.options)("%s: expected status and reason count as a pass", (scenario) => {
    const e = ATTACK_EXPECTATIONS[scenario];
    const done = job({ status: e.status, reasonCode: e.reasonCode });
    expect(compareOutcome(done, scenario).kind).toBe("expected");
  });

  it("waits for a terminal status", () => {
    expect(compareOutcome(undefined, "bypass")).toEqual({ kind: "pending" });
    expect(compareOutcome(job({ status: "broadcasting" }), "bypass")).toEqual({ kind: "pending" });
  });

  it("flags an attack that got through or was stopped for the wrong reason", () => {
    expect(compareOutcome(job({ status: "confirmed" }), "bypass").kind).toBe("unexpected");
    const e = ATTACK_EXPECTATIONS.bypass;
    expect(compareOutcome(job({ status: e.status, revertError: "SomethingElse" }), "bypass")).toEqual({
      kind: "unexpected",
      label: `Not as expected: ${e.status} · SomethingElse`,
    });
  });

  it("accepts the reason from revertError (Shield 2 reverts carry it there)", () => {
    const e = ATTACK_EXPECTATIONS.bypass;
    expect(compareOutcome(job({ status: e.status, revertError: e.reasonCode }), "bypass").kind).toBe("expected");
  });
});

describe("describeApiError", () => {
  const err = (code: ConstructorParameters<typeof ApiError>[0]["code"], status: number, retryAfterSec: number | null = null, detail?: string) =>
    new ApiError({ status, code, retryAfterSec, problem: detail ? { type: "/errors/x", title: "x", status, code: code as never, detail } : null });

  it("turns 429 into a wait message with the Retry-After seconds", () => {
    expect(describeApiError(err("COOLDOWN", 429, 30))).toEqual({ message: "Cooling down to prevent spam.", retryAfterSec: 30 });
    expect(describeApiError(err("RATE_LIMITED", 429)).message).toContain("Try again in a few minutes");
  });

  it("explains busy queue, low gas and invalid input", () => {
    expect(describeApiError(err("QUEUE_BUSY", 409)).message).toBe("Another order is running. Wait for it to finish, then press again.");
    expect(describeApiError(err("AGENT_LOW_GAS", 503)).message).toContain("out of AVAX");
    expect(describeApiError(err("VALIDATION_ERROR", 400, null, "text is too long")).message).toBe("Invalid request: text is too long");
  });

  it("keeps the client's text for network failures and handles non-API errors", () => {
    expect(describeApiError(err("NETWORK_ERROR", 0)).message).toContain("Cannot reach the server");
    expect(describeApiError(new Error("boom")).message).toBe("Something unexpected went wrong. Try again later.");
  });
});

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("counts whole seconds down to 0 and stops", () => {
    const { result } = renderHook(({ until }) => useCountdown(until), { initialProps: { until: Date.now() + 3_000 as number | null } });
    expect(result.current).toBe(3);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(2);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(0);
  });

  it("is 0 without a deadline", () => {
    const { result } = renderHook(() => useCountdown(null));
    expect(result.current).toBe(0);
  });
});
