import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, SAFE } from "@/test/apiFixtures";
import { createAttack, createRebalanceJob } from "./endpoints";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("write endpoints (api.md #10, #12)", () => {
  it("POSTs the attack as JSON to the vault and parses the 202", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ jobId: "a1b20000-0000-4000-8000-000000000009", scenario: "bypass", status: "queued" }, { status: 202 }));
    const r = await createAttack(SAFE, { scenario: "bypass" });
    expect(r.scenario).toBe("bypass");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`/api/v1/vaults/${SAFE}/attacks`);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(init?.credentials).toBe("include");
  });

  it("refuses a body the shared schema rejects before anything is sent", () => {
    expect(() => createAttack(SAFE, { scenario: "bypass", text: "extra" } as never)).toThrow();
    expect(() => createRebalanceJob(SAFE, { kind: "rebalance", amountIn: "0" })).toThrow();
    expect(() => createRebalanceJob(SAFE, { kind: "rebalance", amountIn: "1.5" })).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a 202 that drifted from the shared schema", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ jobId: "not-a-uuid", status: "queued" }, { status: 202 }));
    await expect(createRebalanceJob(SAFE, { kind: "rebalance", amountIn: "200000000" })).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
});
