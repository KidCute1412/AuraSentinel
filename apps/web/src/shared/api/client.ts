import { ProblemDetails, type ErrorCode } from "@agentshield/shared";
import type { z } from "zod";

const RAW_BASE = (import.meta.env.VITE_API_URL ?? "").trim() || "/api";

/** Where the API lives (VITE_API_URL, default same-origin "/api" through the dev proxy). */
export const API_BASE = RAW_BASE.replace(/\/+$/, "");
/** api.md §1: every resource is under /api/v1; the server owns that prefix. */
export const API_V1 = `${API_BASE}/v1`;

export const apiUrl = (path: string): string => `${API_V1}${path.startsWith("/") ? path : `/${path}`}`;

/** Server codes from problem+json, plus the three failures that never reach the server's error format. */
export type ApiErrorCode = ErrorCode | "NETWORK_ERROR" | "BAD_RESPONSE" | "HTTP_ERROR";

const FALLBACK_COPY: Record<"NETWORK_ERROR" | "BAD_RESPONSE" | "HTTP_ERROR", string> = {
  NETWORK_ERROR: "Cannot reach the server. Check your connection and try again.",
  BAD_RESPONSE: "The server sent data in an unexpected format.",
  HTTP_ERROR: "The server hit an error. Try again in a few minutes.",
};

interface ApiErrorInit {
  status: number;
  code: ApiErrorCode;
  problem?: ProblemDetails | null;
  retryAfterSec?: number | null;
  cause?: unknown;
}

/**
 * Every failed API call throws this. `message` is user-facing English: the server's
 * problem `detail`/`title`, or a fixed sentence when the server could not answer.
 * `reason` carries the revert/precheck reason code when the server sends one; once the Q1
 * map it with `formatReason(reason)` (shared/lib/reasonCopy) for the UI.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly reason: string | null;
  readonly problem: ProblemDetails | null;
  readonly retryAfterSec: number | null;

  constructor({ status, code, problem = null, retryAfterSec = null, cause }: ApiErrorInit) {
    const fallback = code in FALLBACK_COPY ? FALLBACK_COPY[code as keyof typeof FALLBACK_COPY] : FALLBACK_COPY.HTTP_ERROR;
    super(problem?.detail ?? problem?.title ?? fallback, { cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.problem = problem;
    this.reason = problem?.reason ?? null;
    this.retryAfterSec = retryAfterSec;
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function retryAfter(res: Response): number | null {
  const raw = res.headers.get("Retry-After");
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  return Number.parseInt(raw, 10);
}

/** Turns a non-2xx response into an ApiError. A body that is not RFC 9457 becomes HTTP_ERROR. */
export async function apiErrorFromResponse(res: Response): Promise<ApiError> {
  const parsed = ProblemDetails.safeParse(await readJson(res));
  return parsed.success
    ? new ApiError({ status: res.status, code: parsed.data.code, problem: parsed.data, retryAfterSec: retryAfter(res) })
    : new ApiError({ status: res.status, code: "HTTP_ERROR", retryAfterSec: retryAfter(res) });
}

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  /** Sent as JSON with the matching Content-Type. */
  json?: unknown;
}

/**
 * Fetch + Zod. The response is parsed with `schema`, so money stays a base-unit string and a
 * payload that drifted from @agentshield/shared fails loudly (BAD_RESPONSE) instead of rendering junk.
 * Cookies are always sent (`credentials: "include"`) for the SIWE session.
 */
export async function apiRequest<S extends z.ZodTypeAny>(path: string, schema: S, init: ApiRequestInit = {}): Promise<z.output<S>> {
  const { json, headers, ...rest } = init;
  const h = new Headers(headers);
  h.set("Accept", "application/json");
  if (json !== undefined) h.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      credentials: "include",
      ...rest,
      headers: h,
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch (cause) {
    if (rest.signal?.aborted) throw cause; // let TanStack Query see its own cancellation
    throw new ApiError({ status: 0, code: "NETWORK_ERROR", cause });
  }

  if (!res.ok) throw await apiErrorFromResponse(res);

  const parsed = schema.safeParse(res.status === 204 ? undefined : await readJson(res));
  if (!parsed.success) throw new ApiError({ status: res.status, code: "BAD_RESPONSE", cause: parsed.error });
  return parsed.data as z.output<S>;
}
