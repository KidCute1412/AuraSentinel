import { useMemo } from "react";
import type { JobDetailDto, JobDto, StateDto } from "@agentshield/shared";
import { sameAddress } from "@/shared/lib/address";
import { ApiError } from "./client";
import { isLive, type DataSource } from "./dataSource";
import { useCreateRebalance, useJob, useJobs, useLaunchAttack, useVaultEvents, useVaultState } from "./hooks";
import { startJob, useVaultSim } from "./mockChain";
import type { JobSpec, VaultSim } from "./mockEngine";
import type { VaultView } from "./vaultSource";

/**
 * What the vault pages read, from one source picked at build time (shared/api/dataSource.ts). The mock and live
 * implementations return the same shapes, so pages never branch on the source except to hide what live cannot do yet.
 */

/** "unavailable" = the source answered with an error (live: e.g. GET /state is not served yet, A3). */
export type LoadStatus = "loading" | "ready" | "unavailable";

export interface VaultFeed {
  source: DataSource;
  /** Chain state (P1). null while loading or unavailable: never filled with made-up numbers. */
  state: StateDto | null;
  stateStatus: LoadStatus;
  /** Newest first. Live: GET /vaults/{safe}/jobs, without the audit trail (read one job with useJobDetail). */
  jobs: JobDto[];
  jobsStatus: LoadStatus;
  /** The server has older jobs than the ones loaded (live only). */
  hasMoreJobs: boolean;
  /** Exact balances around the latest confirmed swap. Mock only; live has no such record yet. */
  lastChange: VaultSim["lastChange"];
  /** Try the reads again after an error. */
  refetch: () => void;
}

const noop = () => {};

const MOCK_LOADING: VaultFeed = {
  source: "mock",
  state: null,
  stateStatus: "loading",
  jobs: [],
  jobsStatus: "loading",
  hasMoreJobs: false,
  lastChange: null,
  refetch: noop,
};

export function useMockVaultFeed(view: VaultView): VaultFeed {
  const sim = useVaultSim(view);
  return useMemo(
    () =>
      sim
        ? { source: "mock", state: sim.state, stateStatus: "ready", jobs: sim.jobs, jobsStatus: "ready", hasMoreJobs: false, lastChange: sim.lastChange, refetch: noop }
        : MOCK_LOADING,
    [sim],
  );
}

const statusOf = (q: { data: unknown; isError: boolean }): LoadStatus => (q.data !== undefined ? "ready" : q.isError ? "unavailable" : "loading");

export function useLiveVaultFeed(view: VaultView): VaultFeed {
  const state = useVaultState(view.safe);
  const jobs = useJobs(view.safe);
  const { refetch: refetchState } = state;
  const { refetch: refetchJobs } = jobs;
  return useMemo(
    () => ({
      source: "live",
      state: state.data ?? null,
      stateStatus: statusOf({ data: state.data, isError: state.isError }),
      jobs: jobs.data?.items ?? [],
      jobsStatus: statusOf({ data: jobs.data, isError: jobs.isError }),
      hasMoreJobs: Boolean(jobs.data?.nextCursor),
      lastChange: null,
      refetch: () => {
        void refetchState();
        void refetchJobs();
      },
    }),
    // Only the fields read above: the query result objects themselves are new on every render.
    [state.data, state.isError, jobs.data, jobs.isError, refetchState, refetchJobs],
  );
}

/** One job with its audit trail. "missing" = no such job in this vault (unknown id, or it belongs elsewhere). */
export interface JobDetailFeed {
  job: JobDetailDto | undefined;
  status: "loading" | "ready" | "missing" | "unavailable";
}

const MISSING: JobDetailFeed = { job: undefined, status: "missing" };

export function useMockJobDetail(view: VaultView, id: string | null | undefined): JobDetailFeed {
  const sim = useVaultSim(view);
  if (!id) return MISSING;
  if (!sim) return { job: undefined, status: "loading" };
  const job = sim.jobs.find((j) => j.id === id);
  return job ? { job, status: "ready" } : MISSING;
}

export function useLiveJobDetail(view: VaultView, id: string | null | undefined): JobDetailFeed {
  const q = useJob(id, { pollWhileRunning: true });
  if (!id) return MISSING;
  if (q.data) return sameAddress(q.data.vault, view.safe) ? { job: q.data, status: "ready" } : MISSING;
  if (q.isError) {
    // 404 JOB_NOT_FOUND, or 400 for an id that is not a UUID: both mean "no such job".
    const notFound = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 400);
    return notFound ? MISSING : { job: undefined, status: "unavailable" };
  }
  return { job: undefined, status: "loading" };
}

/** Starts a rebalance, an attack or an injection and resolves with the new job id. */
export interface JobLauncher {
  launch: (spec: JobSpec) => Promise<string>;
}

export function useMockJobLauncher(view: VaultView): JobLauncher {
  return useMemo(() => ({ launch: async (spec: JobSpec) => startJob(view, spec) }), [view]);
}

/**
 * Real POSTs (api.md #10, #12). Only the scenario and the suggested amount leave the browser: the server fixes every
 * other parameter, and the Rebalancer/Auditor still clamp and check the amount.
 */
export function useLiveJobLauncher(view: VaultView): JobLauncher {
  const { mutateAsync: rebalance } = useCreateRebalance(view.safe);
  const { mutateAsync: attack } = useLaunchAttack(view.safe);
  return useMemo(
    () => ({
      launch: async (spec: JobSpec) => {
        switch (spec.type) {
          case "rebalance":
            return (await rebalance(spec.amountIn.toString())).jobId;
          case "attack":
            return (await attack({ scenario: spec.scenario })).jobId;
          case "injection":
            return (await attack({ scenario: "prompt-injection", text: spec.text })).jobId;
        }
      },
    }),
    [rebalance, attack],
  );
}

/** The one SSE connection for the vault on screen (live only). Renders nothing; keeps the query cache current. */
export function LiveVaultEvents({ safe }: { safe: string }): null {
  useVaultEvents(safe);
  return null;
}

/** Symbol and decimals of a token, from the chain-sourced state (never from a hard-coded list in live mode). */
export const tokenMeta = (state: StateDto | null, token: string): StateDto["balances"][number] | undefined =>
  state?.balances.find((b) => sameAddress(b.token, token));

// Picked once at module load, so every render calls the same hooks in the same order.
export const useVaultFeed: (view: VaultView) => VaultFeed = isLive ? useLiveVaultFeed : useMockVaultFeed;
export const useJobDetail: (view: VaultView, id: string | null | undefined) => JobDetailFeed = isLive ? useLiveJobDetail : useMockJobDetail;
export const useJobLauncher: (view: VaultView) => JobLauncher = isLive ? useLiveJobLauncher : useMockJobLauncher;
