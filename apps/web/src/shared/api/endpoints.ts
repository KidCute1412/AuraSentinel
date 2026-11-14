import {
  CreateAttackRequest,
  CreateAttackResponse,
  CreateJobRequest,
  CreateJobResponse,
  CreateSessionRequest,
  GetSessionResponse,
  JobDetailDto,
  JobListDto,
  NonceResponse,
  SessionDto,
  StateDto,
  VaultDto,
  VaultListDto,
  type JobStatus,
} from "@agentshield/shared";
import { z } from "zod";
import { RebalancerStatusDto } from "./adminSchemas";
import { apiRequest, apiUrl } from "./client";

/** Endpoints from api.md §2. Owner actions (setPolicy, Kill-Switch) never go through the API (P2). */

/** #5: every registered vault (public; the registry holds no policy state). "Mine" is filtered on the client. */
export const getVaults = (signal?: AbortSignal) => apiRequest("/vaults", VaultListDto, { signal });

/** #6: who owns and runs one vault. 404 VAULT_NOT_FOUND until its module is enabled on the Safe. */
export const getVault = (safe: string, signal?: AbortSignal) => apiRequest(`/vaults/${safe}`, VaultDto, { signal });

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

/** #1: single-use SIWE nonce (POST because issuing one has a side effect). */
export const requestNonce = () => apiRequest("/auth/nonce", NonceResponse, { method: "POST" });

/** #2: verify the signed EIP-4361 message; the server answers with the session and sets the httpOnly cookie. */
export const createSession = (body: CreateSessionRequest) =>
  apiRequest("/auth/session", SessionDto, { method: "POST", json: CreateSessionRequest.parse(body) });

/** #4: sign out. Idempotent. */
export const deleteSession = () => apiRequest("/auth/session", z.undefined(), { method: "DELETE" });

/** #13: SSE stream for one vault. */
export const vaultEventsUrl = (safe: string) => apiUrl(`/vaults/${safe}/events`);

// ---- Writes (Q10). Bodies are validated with the shared schema before they leave the browser.

/** #10: queue a rebalance. The amount is only a hint: Rebalancer/Auditor still clamp and check it. */
export const createRebalanceJob = (safe: string, body: CreateJobRequest) =>
  apiRequest(`/vaults/${safe}/jobs`, CreateJobResponse, { method: "POST", json: CreateJobRequest.parse(body) });

/** #12: launch one red-team attack. Every attack parameter is fixed on the server; we only pick the scenario. */
export const createAttack = (safe: string, body: CreateAttackRequest) =>
  apiRequest(`/vaults/${safe}/attacks`, CreateAttackResponse, { method: "POST", json: CreateAttackRequest.parse(body) });

/** #15: scheduler state for the admin drawer (AdminGuard on the server). */
export const getRebalancerStatus = (signal?: AbortSignal) => apiRequest("/admin/rebalancer", RebalancerStatusDto, { signal });

/** #16: Demo mode on/off. Idempotent; returns the same resource as #15. */
export const setRebalancerPaused = (paused: boolean) =>
  apiRequest("/admin/rebalancer", RebalancerStatusDto, { method: "PATCH", json: { paused } });
