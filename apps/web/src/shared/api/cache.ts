import { JOB_TERMINAL_STATUSES, type Explanation, type JobDetailDto, type JobDto, type JobListDto, type ServerEvent, type StateDto } from "@agentshield/shared";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

/**
 * Applies one SSE event to the TanStack Query cache (api.md §7: setQueryData, no refetch per
 * event). Caches that were never loaded are left alone; their first fetch brings fresh data.
 * Chain events only say "something changed on chain", so they invalidate the state snapshot
 * instead of guessing new balances (P1: the chain, via the server, is the source of truth).
 */
export function applyServerEvent(qc: QueryClient, safe: string, event: ServerEvent): void {
  switch (event.type) {
    case "job.updated":
      upsertJob(qc, safe, event.job);
      return;
    case "job.explained":
      attachExplanation(qc, safe, event.jobId, event.explanation);
      return;
    case "chain.revoked":
      // Turn the UI red immediately; the refetch then confirms from chain.
      qc.setQueryData<StateDto>(queryKeys.vaultState(safe), (s) => (s ? { ...s, isActive: false } : s));
      void qc.invalidateQueries({ queryKey: queryKeys.vaultState(safe) });
      return;
    case "chain.swap":
    case "chain.policy":
      void qc.invalidateQueries({ queryKey: queryKeys.vaultState(safe) });
      return;
    case "vault.registered":
      void qc.invalidateQueries({ queryKey: queryKeys.vaults });
      return;
  }
}

const terminal = (status: JobDto["status"]) => JOB_TERMINAL_STATUSES.includes(status);

/**
 * Whether `incoming` may replace `current`. Events and refetches can arrive out of order (a list refetch that read
 * the database a moment before the job finished lands after the SSE event that finished it), so the newer
 * `updatedAt` wins, and on a tie a finished job never goes back to a running status.
 */
export function isFresher(current: Pick<JobDto, "status" | "updatedAt"> | undefined, incoming: Pick<JobDto, "status" | "updatedAt">): boolean {
  if (!current) return true;
  const was = Date.parse(current.updatedAt);
  const now = Date.parse(incoming.updatedAt);
  if (Number.isFinite(was) && Number.isFinite(now) && was !== now) return now > was;
  return !(terminal(current.status) && !terminal(incoming.status));
}

/**
 * useJobs' structural sharing: a refetched page keeps any job the cache already knows in a newer state (see
 * isFresher), so a slow GET /jobs can never undo a verdict the SSE stream already delivered.
 */
export function keepFresherJobs(old: unknown, next: unknown): unknown {
  const prev = old as JobListDto | undefined;
  const page = next as JobListDto | undefined;
  if (!prev?.items || !page?.items) return next;
  const known = new Map(prev.items.map((j) => [j.id, j]));
  return { ...page, items: page.items.map((j) => (isFresher(known.get(j.id), j) ? j : known.get(j.id)!)) };
}

/** The explanation arrives on its own event and may land before the job's last update: never drop it. */
const keepExplanation = (incoming: JobDto, existing: { explanation: Explanation | null } | undefined): Explanation | null =>
  incoming.explanation ?? existing?.explanation ?? null;

function upsertJob(qc: QueryClient, safe: string, job: JobDto): void {
  const before = qc.getQueryData<JobDetailDto>(queryKeys.job(job.id));
  const prevStatus =
    before?.status ?? qc.getQueryData<JobListDto>(queryKeys.vaultJobs(safe))?.items.find((j) => j.id === job.id)?.status;

  // A confirmed swap moved money; refresh balances even if the indexer event is late.
  if (job.status === "confirmed" && prevStatus !== "confirmed") {
    void qc.invalidateQueries({ queryKey: queryKeys.vaultState(safe) });
  }

  qc.setQueryData<JobListDto>(queryKeys.vaultJobs(safe), (list) => {
    if (!list) return list;
    const i = list.items.findIndex((j) => j.id === job.id);
    if (i === -1) return { ...list, items: [{ ...job, explanation: keepExplanation(job, undefined) }, ...list.items] };
    if (!isFresher(list.items[i], job)) return list;
    const items = list.items.slice();
    items[i] = { ...job, explanation: keepExplanation(job, list.items[i]) };
    return { ...list, items };
  });

  if (!before || !isFresher(before, job)) return;
  qc.setQueryData<JobDetailDto>(queryKeys.job(job.id), { ...before, ...job, explanation: keepExplanation(job, before) });

  // Reaching a terminal status adds audit rows the event does not carry: refetch the detail once.
  if (JOB_TERMINAL_STATUSES.includes(job.status) && before.status !== job.status) {
    void qc.invalidateQueries({ queryKey: queryKeys.job(job.id) });
  }
}

function attachExplanation(qc: QueryClient, safe: string, jobId: string, explanation: Explanation): void {
  qc.setQueryData<JobListDto>(queryKeys.vaultJobs(safe), (list) =>
    list ? { ...list, items: list.items.map((j) => (j.id === jobId ? { ...j, explanation } : j)) } : list,
  );
  qc.setQueryData<JobDetailDto>(queryKeys.job(jobId), (d) => (d ? { ...d, explanation } : d));
}
