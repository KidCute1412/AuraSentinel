import { StateDto } from "@agentshield/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, SAFE, state } from "@/test/apiFixtures";
import { ApiError, apiRequest, apiUrl } from "./client";
import { getJobs, getVaultState } from "./endpoints";

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => fetchMock.mockReset());

const problemResponse = (body: object, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/problem+json", ...headers } });

async function caught(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error("expected ApiError");
}

describe("apiRequest", () => {
  it("prefixes /api/v1 and always sends the session cookie", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(state));
    await getVaultState(SAFE);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/v1/vaults/${SAFE}/state`);
    expect(init?.credentials).toBe("include");
    expect(apiUrl("jobs/1")).toBe("/api/v1/jobs/1");
  });

  it("keeps money as base-unit strings (no floats, P5)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(state));
    const s = await getVaultState(SAFE);
    expect(s.balances[1]!.amount).toBe("10900000000000000000");
    expect(typeof s.policy.limits[0]!.dailyCap).toBe("string");
    expect(s.spentToday[0]!.amount).toBe("200000000");
  });

  it("builds the jobs query string", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));
    await getJobs(SAFE, { limit: 50, status: "rejected" });
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/vaults/${SAFE}/jobs?limit=50&status=rejected`);
  });

  it("turns problem+json into a typed ApiError", async () => {
    fetchMock.mockResolvedValueOnce(
      problemResponse(
        { type: "/errors/not-owner", title: "Not owner", status: 403, detail: "Ví không phải owner của Safe", code: "NOT_OWNER", reason: null },
        403,
      ),
    );
    const err = await caught(getVaultState(SAFE));
    expect(err.status).toBe(403);
    expect(err.code).toBe("NOT_OWNER");
    expect(err.reason).toBeNull();
    expect(err.message).toBe("Ví không phải owner của Safe");
  });

  it("keeps the reason code and Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(
      problemResponse({ type: "/errors/cooldown", title: "Cooldown", status: 429, code: "COOLDOWN", reason: "ExceedsDailyCap" }, 429, {
        "Retry-After": "12",
      }),
    );
    const err = await caught(getVaultState(SAFE));
    expect(err.code).toBe("COOLDOWN");
    expect(err.reason).toBe("ExceedsDailyCap");
    expect(err.retryAfterSec).toBe(12);
    expect(err.message).toBe("Cooldown");
  });

  it("maps a non-RFC 9457 error body to HTTP_ERROR", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const err = await caught(getVaultState(SAFE));
    expect(err.code).toBe("HTTP_ERROR");
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/Máy chủ/);
  });

  it("rejects a payload that drifted from the shared schema", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...state, balances: [{ ...state.balances[0], amount: 2800 }] }));
    const err = await caught(apiRequest("/vaults/x/state", StateDto));
    expect(err.code).toBe("BAD_RESPONSE");
  });

  it("reports a network failure as NETWORK_ERROR (status 0)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const err = await caught(getVaultState(SAFE));
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.status).toBe(0);
  });

  it("does not wrap its own abort", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await expect(getVaultState(SAFE, ctrl.signal)).rejects.toThrow(DOMException);
  });

  it("sends JSON bodies with the right content type", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { z } = await import("zod");
    await apiRequest("/auth/session", z.undefined(), { method: "DELETE", json: { a: "1" } });
    const init = fetchMock.mock.calls[0]![1]!;
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(init.body).toBe('{"a":"1"}');
  });
});
