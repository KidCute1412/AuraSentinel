import { describe, expect, it } from "vitest";
import type { Address, JobDetailDto } from "@agentshield/shared";
import { seedSim } from "@/shared/api/mockChain";
import { FIXTURES, FIXTURE_SAFES } from "@/shared/api/vaultSource";
import { EXPIRY_CHOICES, parseLimit, policyDiff, validatePolicy, valuesFromState, type PolicyFormValues } from "./policyForm";
import { timelineSteps } from "./timeline";
import { tourProgress } from "./tour";

const NOW = 1_800_000_000;
const healthy = () => seedSim(FIXTURES[FIXTURE_SAFES.healthy.toLowerCase()], NOW * 1000)!;

describe("parseLimit", () => {
  it("parses decimals exactly into base units", () => {
    expect(parseLimit("500", 6)).toEqual({ value: 500_000_000n });
    expect(parseLimit("1,500.25", 6)).toEqual({ value: 1_500_250_000n });
    expect(parseLimit("0.5", 18)).toEqual({ value: 500_000_000_000_000_000n });
  });

  it("explains every way an input can be wrong", () => {
    expect(parseLimit("", 6)).toEqual({ error: "Enter an amount" });
    expect(parseLimit("abc", 6)).toEqual({ error: "Use digits and a dot only" });
    expect(parseLimit("-5", 6)).toEqual({ error: "Use digits and a dot only" });
    expect(parseLimit("1.1234567", 6)).toEqual({ error: "At most 6 decimals" });
    expect(parseLimit("0", 6)).toEqual({ error: "Must be greater than zero" });
    expect(parseLimit("9999999999999", 6)).toEqual({ error: "That is more than the app allows" });
  });
});

describe("validatePolicy", () => {
  const good: PolicyFormValues = { usdcMaxPerTx: "500", usdcDailyCap: "1500", wavaxMaxPerTx: "20", wavaxDailyCap: "60", expiryDays: 30 };

  it("accepts a sane policy and computes the expiry timestamp", () => {
    const r = validatePolicy(good, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.usdcMaxPerTx).toBe(500_000_000n);
      expect(r.input.expiry).toBe(NOW + 30 * 86_400);
    }
  });

  it("rejects a per-transaction limit above the daily limit, per token", () => {
    const r = validatePolicy({ ...good, usdcMaxPerTx: "2000", wavaxMaxPerTx: "100" }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.usdcMaxPerTx).toMatch(/cannot exceed/);
      expect(r.errors.wavaxMaxPerTx).toMatch(/cannot exceed/);
    }
  });

  it("allows equal limits and rejects an unknown expiry", () => {
    expect(validatePolicy({ ...good, usdcMaxPerTx: "1500" }, NOW).ok).toBe(true);
    const bad = validatePolicy({ ...good, expiryDays: 365 }, NOW);
    expect(bad.ok).toBe(false);
    expect(EXPIRY_CHOICES.map((c) => c.days)).toEqual([1, 7, 30, 90]);
  });

  it("round-trips the current policy through the form", () => {
    const sim = healthy();
    const values = valuesFromState(sim.state);
    expect(values.usdcMaxPerTx).toBe("500");
    const r = validatePolicy(values, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(policyDiff(sim.state, r.input, NOW).filter((d) => d.label !== "Expires in").every((d) => !d.changed)).toBe(true);
  });

  it("shows only what changed in the preview", () => {
    const sim = healthy();
    const r = validatePolicy({ ...valuesFromState(sim.state), usdcMaxPerTx: "300" }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const changed = policyDiff(sim.state, r.input, NOW).filter((d) => d.changed && d.label !== "Expires in");
      expect(changed).toEqual([{ label: "USDC per transaction", before: "500 USDC", after: "300 USDC", changed: true }]);
    }
  });
});

describe("timelineSteps", () => {
  const base: Pick<JobDetailDto, "kind" | "origin" | "precheck"> = { kind: "swap", origin: "manual", precheck: { ok: true, reasons: [] } };
  const e = (shield: JobDetailDto["audit"][number]["shield"], result: "pass" | "fail" = "pass", reason: string | null = null) => ({ shield, result, reason, ts: "t" });
  const states = (steps: ReturnType<typeof timelineSteps>) => steps.map((s) => s.state);

  it("queued: nothing has started", () => {
    expect(states(timelineSteps({ ...base, status: "queued", audit: [] }))).toEqual(["pending", "pending", "pending", "pending"]);
  });

  it("highlights exactly the running step while in flight", () => {
    expect(states(timelineSteps({ ...base, status: "prechecking", audit: [] }))).toEqual(["active", "pending", "pending", "pending"]);
    expect(states(timelineSteps({ ...base, status: "simulating", audit: [e("precheck")] }))).toEqual(["pass", "active", "pending", "pending"]);
    expect(states(timelineSteps({ ...base, status: "broadcasting", audit: [e("precheck"), e("simulation"), e("invariant")] }))).toEqual(["pass", "pass", "pass", "active"]);
  });

  it("a Shield 1 block fails the first step and skips the rest", () => {
    const steps = timelineSteps({ ...base, status: "rejected", audit: [e("precheck", "fail", "ExceedsPerTxCap")] });
    expect(states(steps)).toEqual(["fail", "skipped", "skipped", "skipped"]);
    expect(steps[0].note).toBe("Over the per-transaction cap");
  });

  it("a bypass attack skips Shield 1 and fails only on-chain", () => {
    const steps = timelineSteps({ kind: "attack", origin: "redteam", precheck: null, status: "reverted", audit: [e("onchain", "fail", "ExceedsPerTxCap")] });
    expect(states(steps)).toEqual(["skipped", "skipped", "skipped", "fail"]);
    expect(steps[0].note).toBe("Skipped: the website was bypassed");
  });

  it("carries the audit timestamp of each step that ran, and none for the others", () => {
    const steps = timelineSteps({ ...base, status: "rejected", audit: [e("precheck", "fail", "ExceedsPerTxCap")] });
    expect(steps.map((s) => s.ts)).toEqual(["t", null, null, null]);
  });

  it("a confirmed job passes everything", () => {
    expect(states(timelineSteps({ ...base, status: "confirmed", audit: [e("precheck"), e("simulation"), e("invariant"), e("onchain")] }))).toEqual(["pass", "pass", "pass", "pass"]);
  });
});

describe("seedSim", () => {
  it("replays real decisions so history, balances and budget agree", () => {
    const sim = healthy();
    expect(sim.jobs.map((j) => j.status)).toEqual(["reverted", "rejected", "confirmed"]);
    expect(sim.state.budgetUsedPct).toBeCloseTo(13.3, 1);
    expect(sim.lastChange?.before.find((b) => b.symbol === "USDC")?.amount).toBe("3000000000");
    expect(sim.lastChange?.after.find((b) => b.symbol === "USDC")?.amount).toBe("2800000000");
  });

  it("seeds each special state", () => {
    const get = (k: keyof typeof FIXTURE_SAFES) => seedSim(FIXTURES[FIXTURE_SAFES[k].toLowerCase()], NOW * 1000);
    expect(get("killed")!.state.isActive).toBe(false);
    expect(get("demo")!.state.budgetUsedPct).toBeCloseTo(87.5, 1);
    expect(get("exhausted")!.state.budgetUsedPct).toBe(100);
    expect(get("stale")!.state.stale).toBe(true);
    expect(get("stoppedAtModule")).toBeNull();
  });
});

describe("tourProgress", () => {
  const safe = FIXTURE_SAFES.healthy as Address;
  const sim = healthy();
  const jobsAt = (iso: string) => sim.jobs.map((j) => ({ ...j, createdAt: iso }));

  it("counts only what the visitor did during this visit", () => {
    const before = tourProgress(sim.jobs, safe, NOW * 1000 + 1, false);
    expect(before.every((s) => !s.done)).toBe(true);
  });

  it("detects rebalance, over-withdraw and bypass from the jobs, and the kill from the visit", () => {
    const since = Date.parse("2026-01-01T00:00:00Z");
    const steps = tourProgress(jobsAt("2026-06-01T00:00:00Z"), safe, since, true);
    expect(steps.map((s) => s.done)).toEqual([true, true, true, true]);
  });
});
