import { describe, expect, it } from "vitest";
import type { JobDetailDto } from "@agentshield/shared";
import { activityParams, filterJobs, hasFilter, jobType, parseActivityFilter, type ActivityFilter } from "./activity";

type Row = Pick<JobDetailDto, "status" | "kind" | "origin"> & { n: number };

const swap = (n: number, status: Row["status"] = "confirmed"): Row => ({ n, status, kind: "swap", origin: "rebalancer" });
const attack = (n: number, status: Row["status"] = "rejected"): Row => ({ n, status, kind: "attack", origin: "redteam" });
const all: ActivityFilter = { status: null, type: null, page: 1 };

describe("parseActivityFilter", () => {
  it("reads valid values from the query string", () => {
    expect(parseActivityFilter(new URLSearchParams("status=reverted&type=attack&page=3"))).toEqual({ status: "reverted", type: "attack", page: 3 });
  });

  it("ignores anything it does not know instead of failing", () => {
    for (const qs of ["status=drained&type=hack&page=0", "page=-1", "page=1.5", "page=abc", "page=999999", "status=Confirmed"]) {
      const f = parseActivityFilter(new URLSearchParams(qs));
      expect(f.page).toBe(1);
      expect(f.status).toBeNull();
      expect(f.type).toBeNull();
    }
  });

  it("round-trips through activityParams and leaves defaults out", () => {
    const f: ActivityFilter = { status: "failed", type: "rebalance", page: 2 };
    expect(parseActivityFilter(activityParams(f))).toEqual(f);
    expect(activityParams(all).toString()).toBe("");
    expect(hasFilter(all)).toBe(false);
    expect(hasFilter({ ...all, type: "attack" })).toBe(true);
  });
});

describe("filterJobs", () => {
  const jobs = [attack(1, "reverted"), swap(2), swap(3, "failed"), attack(4), swap(5, "simulating"), swap(6)];

  it("keeps the newest-first order and filters by status and type together", () => {
    expect(filterJobs(jobs, { ...all, status: "confirmed" }).items.map((j) => j.n)).toEqual([2, 6]);
    expect(filterJobs(jobs, { ...all, type: "attack" }).items.map((j) => j.n)).toEqual([1, 4]);
    expect(filterJobs(jobs, { status: "rejected", type: "rebalance", page: 1 }).total).toBe(0);
  });

  it("shows running jobs only when no status is picked", () => {
    expect(filterJobs(jobs, all).items.map((j) => j.n)).toContain(5);
    for (const status of ["confirmed", "rejected", "reverted", "failed"] as const) {
      expect(filterJobs(jobs, { ...all, status }).items.map((j) => j.n)).not.toContain(5);
    }
  });

  it("pages and clamps a page past the end to the last one", () => {
    const many = Array.from({ length: 23 }, (_, i) => swap(i));
    const p3 = filterJobs(many, { ...all, page: 3 });
    expect([p3.page, p3.pageCount, p3.total, p3.items.length]).toEqual([3, 3, 23, 3]);
    expect(filterJobs(many, { ...all, page: 9 }).page).toBe(3);
    expect(filterJobs([], { ...all, page: 4 })).toEqual({ items: [], total: 0, page: 1, pageCount: 1 });
  });

  it("classifies red-team jobs as attacks", () => {
    expect(jobType({ kind: "swap", origin: "redteam" })).toBe("attack");
    expect(jobType({ kind: "swap", origin: "manual" })).toBe("rebalance");
  });
});
