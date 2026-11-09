import type { JobDetailDto } from "@agentshield/shared";

/**
 * Filters of /vaults/:safe/activity (ui-pages §10.1), kept in the query string so a filtered view is shareable:
 * ?status=confirmed|rejected|reverted|failed&type=rebalance|attack&page=N. Anything else is ignored, never an error.
 */

export const ACTIVITY_STATUSES = ["confirmed", "rejected", "reverted", "failed"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_TYPES = ["rebalance", "attack"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const PAGE_SIZE = 10;

export interface ActivityFilter {
  status: ActivityStatus | null;
  type: ActivityType | null;
  page: number;
}

const pick = <T extends string>(allowed: readonly T[], value: string | null): T | null =>
  value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;

export function parseActivityFilter(params: URLSearchParams): ActivityFilter {
  const raw = params.get("page");
  const page = raw !== null && /^[1-9]\d{0,4}$/.test(raw) ? Number(raw) : 1;
  return { status: pick(ACTIVITY_STATUSES, params.get("status")), type: pick(ACTIVITY_TYPES, params.get("type")), page };
}

/** Back to a query string, leaving defaults out so the plain URL stays plain. */
export function activityParams(f: ActivityFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.type) p.set("type", f.type);
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}

/** Red-team jobs are attacks; everything else (rebalancer, manual) is a rebalance. */
export const jobType = (job: Pick<JobDetailDto, "kind" | "origin">): ActivityType =>
  job.kind === "attack" || job.origin === "redteam" ? "attack" : "rebalance";

export interface ActivityPage<T> {
  items: T[];
  /** Jobs matching the filter, across all pages. */
  total: number;
  /** The page actually shown (clamped into range). */
  page: number;
  pageCount: number;
}

/** Jobs arrive newest first; filtering keeps that order. A running job only shows under "All statuses". */
export function filterJobs<T extends Pick<JobDetailDto, "status" | "kind" | "origin">>(jobs: readonly T[], f: ActivityFilter, size = PAGE_SIZE): ActivityPage<T> {
  const matching = jobs.filter((j) => (!f.status || j.status === f.status) && (!f.type || jobType(j) === f.type));
  const pageCount = Math.max(1, Math.ceil(matching.length / size));
  const page = Math.min(Math.max(1, f.page), pageCount);
  return { items: matching.slice((page - 1) * size, page * size), total: matching.length, page, pageCount };
}

export const hasFilter = (f: ActivityFilter): boolean => f.status !== null || f.type !== null;
