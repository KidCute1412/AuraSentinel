import type { JobDetailDto, JobListDto, StateDto } from "@agentshield/shared";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { explanation, job, jobDetail, SAFE, state, TX } from "@/test/apiFixtures";
import { applyServerEvent, keepFresherJobs } from "./cache";
import { queryKeys } from "./queryKeys";

let qc: QueryClient;
beforeEach(() => {
  qc = new QueryClient();
});

const list = () => qc.getQueryData<JobListDto>(queryKeys.vaultJobs(SAFE));
const ID_2 = "7f9c0000-0000-4000-8000-000000000002";

describe("applyServerEvent: jobs", () => {
  it("inserts a new job at the top of the list", () => {
    qc.setQueryData<JobListDto>(queryKeys.vaultJobs(SAFE), { items: [job()], nextCursor: null });
    applyServerEvent(qc, SAFE, { type: "job.updated", vault: SAFE, job: job({ id: ID_2 }) });
    expect(list()!.items.map((j) => j.id)).toEqual([ID_2, job().id]);
  });

  it("replaces an existing job in place", () => {
    qc.setQueryData<JobListDto>(queryKeys.vaultJobs(SAFE), { items: [job()], nextCursor: null });
    applyServerEvent(qc, SAFE, { type: "job.updated", vault: SAFE, job: job({ status: "simulating" }) });
    expect(list()!.items).toHaveLength(1);
    expect(list()!.items[0]!.status).toBe("simulating");
  });

  it("keeps an explanation that arrived before the last job update", () => {
    qc.setQueryData<JobListDto>(queryKeys.vaultJobs(SAFE), { items: [job()], nextCursor: null });
    applyServerEvent(qc, SAFE, { type: "job.explained", vault: SAFE, jobId: job().id, explanation });
    applyServerEvent(qc, SAFE, { type: "job.updated", vault: SAFE, job: job({ status: "confirmed", txHash: TX }) });
    expect(list()!.items[0]!.explanation).toEqual(explanation);
    expect(list()!.items[0]!.status).toBe("confirmed");
  });

  it("attaches the explanation to the job detail too", () => {
    qc.setQueryData<JobDetailDto>(queryKeys.job(job().id), jobDetail());
    applyServerEvent(qc, SAFE, { type: "job.explained", vault: SAFE, jobId: job().id, explanation });
    expect(qc.getQueryData<JobDetailDto>(queryKeys.job(job().id))!.explanation).toEqual(explanation);
  });

  it("merges updates into the detail and refetches it once when the job ends", () => {
    qc.setQueryData<JobDetailDto>(queryKeys.job(job().id), jobDetail({ status: "broadcasting" }));
    const spy = vi.spyOn(qc, "invalidateQueries");
    applyServerEvent(qc, SAFE, { type: "job.updated", vault: SAFE, job: job({ status: "reverted", revertError: "ExceedsPerTxCap" }) });
    const d = qc.getQueryData<JobDetailDto>(queryKeys.job(job().id))!;
    expect(d.status).toBe("reverted");
    expect(d.precheck).toEqual({ ok: true, reasons: [] }); // detail-only fields survive
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.job(job().id) });
  });

  it("refreshes balances when a swap is confirmed", () => {
    qc.setQueryData<JobListDto>(queryKeys.vaultJobs(SAFE), { items: [job({ status: "broadcasting" })], nextCursor: null });
    const spy = vi.spyOn(qc, "invalidateQueries");
    applyServerEvent(qc, SAFE, { type: "job.updated", vault: SAFE, job: job({ status: "confirmed", txHash: TX }) });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.vaultState(SAFE) });
  });

  it("ignores an event older than what the cache already has (out-of-order delivery)", () => {
    qc.setQueryData<JobListDto>(queryKeys.vaultJobs(SAFE), { items: [job({ status: "reverted", updatedAt: "2026-11-20T00:00:02.000Z" })], nextCursor: null });
    applyServerEvent(qc, SAFE, { type: "job.updated", vault: SAFE, job: job({ status: "broadcasting", updatedAt: "2026-11-20T00:00:01.000Z" }) });
    expect(list()!.items[0]!.status).toBe("reverted");
    // Same instant: a finished job never goes back to running.
    applyServerEvent(qc, SAFE, { type: "job.updated", vault: SAFE, job: job({ status: "broadcasting", updatedAt: "2026-11-20T00:00:02.000Z" }) });
    expect(list()!.items[0]!.status).toBe("reverted");
  });

  it("does not invent caches that were never loaded", () => {
    applyServerEvent(qc, SAFE, { type: "job.updated", vault: SAFE, job: job() });
    applyServerEvent(qc, SAFE, { type: "job.explained", vault: SAFE, jobId: job().id, explanation });
    expect(list()).toBeUndefined();
    expect(qc.getQueryData(queryKeys.job(job().id))).toBeUndefined();
  });
});

describe("applyServerEvent: chain", () => {
  it("turns the vault inactive right away on Kill-Switch and refetches from chain", () => {
    qc.setQueryData<StateDto>(queryKeys.vaultState(SAFE), state);
    const spy = vi.spyOn(qc, "invalidateQueries");
    applyServerEvent(qc, SAFE, { type: "chain.revoked", vault: SAFE, txHash: TX, latencyMs: 1480 });
    expect(qc.getQueryData<StateDto>(queryKeys.vaultState(SAFE))!.isActive).toBe(false);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.vaultState(SAFE) });
  });

  it("invalidates state on swaps and policy changes without guessing balances", () => {
    qc.setQueryData<StateDto>(queryKeys.vaultState(SAFE), state);
    const spy = vi.spyOn(qc, "invalidateQueries");
    applyServerEvent(qc, SAFE, {
      type: "chain.swap",
      vault: SAFE,
      tokenIn: state.balances[0]!.token,
      tokenOut: state.balances[1]!.token,
      amountIn: "200000000",
      amountOut: "9000000000000000000",
      spentToday: "400000000",
      txHash: TX,
    });
    expect(qc.getQueryData<StateDto>(queryKeys.vaultState(SAFE))).toEqual(state);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.vaultState(SAFE) });
  });

  it("uses one cache entry regardless of address case", () => {
    qc.setQueryData<StateDto>(queryKeys.vaultState(SAFE.toUpperCase().replace("0X", "0x")), state);
    applyServerEvent(qc, SAFE, { type: "chain.revoked", vault: SAFE, txHash: TX });
    expect(qc.getQueryData<StateDto>(queryKeys.vaultState(SAFE))!.isActive).toBe(false);
  });
});

describe("keepFresherJobs (useJobs structural sharing)", () => {
  it("a slow refetch cannot undo a verdict the stream already delivered", () => {
    const old: JobListDto = { items: [job({ status: "reverted", updatedAt: "2026-11-20T00:00:02.000Z" }), job({ id: ID_2, status: "queued" })], nextCursor: null };
    const stale: JobListDto = {
      items: [job({ status: "broadcasting", updatedAt: "2026-11-20T00:00:01.000Z" }), job({ id: ID_2, status: "held", updatedAt: "2026-11-20T00:00:05.000Z" })],
      nextCursor: "c",
    };
    const merged = keepFresherJobs(old, stale) as JobListDto;
    expect(merged.items.map((j) => j.status)).toEqual(["reverted", "held"]);
    expect(merged.nextCursor).toBe("c");
  });

  it("passes the first page through", () => {
    const page: JobListDto = { items: [job()], nextCursor: null };
    expect(keepFresherJobs(undefined, page)).toBe(page);
  });
});
