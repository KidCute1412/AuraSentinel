import { GetSessionResponse, JobDetailDto, JobListDto, StateDto, type JobStatus } from "@agentshield/shared";
import { apiRequest, apiUrl } from "./client";

/** Read endpoints from api.md §2. Writes (jobs, attacks) arrive with Q10; owner actions never go through the API (P2). */

/** #7: balances, policy, spentToday, isActive, read from the chain by the server (P1). */
export const getVaultState = (safe: string, signal?: AbortSignal) => apiRequest(`/vaults/${safe}/state`, StateDto, { signal });

export interface JobsParams {
  limit?: number;
  cursor?: string;
  status?: JobStatus;
}

/** #9: newest first, cursor pagination. */
export function getJobs(safe: string, params: JobsParams = {}, signal?: AbortSignal) {
  const q = new URLSearchParams();
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.status) q.set("status", params.status);
  const qs = q.toString();
  return apiRequest(`/vaults/${safe}/jobs${qs ? `?${qs}` : ""}`, JobListDto, { signal });
}

/** #11: job plus precheck, sim and audit trail. */
export const getJob = (id: string, signal?: AbortSignal) => apiRequest(`/jobs/${encodeURIComponent(id)}`, JobDetailDto, { signal });

/** #3: `{ address: null, role: null }` when signed out. */
export const getSession = (signal?: AbortSignal) => apiRequest("/auth/session", GetSessionResponse, { signal });

/** #13: SSE stream for one vault. */
export const vaultEventsUrl = (safe: string) => apiUrl(`/vaults/${safe}/events`);
