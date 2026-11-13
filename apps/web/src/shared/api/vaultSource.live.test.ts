import { getAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test/apiFixtures";
import { fetchDemoSafe, fetchMyVaults, fetchVaultView } from "./vaultSource";

// A VITE_DATA_SOURCE=live build without VITE_DEMO_SAFE: every vault fact comes from the server (A3).
vi.mock("./dataSource", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./dataSource")>();
  return { ...actual, DATA_SOURCE: "live", isLive: true, LIVE_DEMO_SAFE: null };
});

const SAFE = getAddress("0x5afe000000000000000000000000000000000001");
const DEMO = getAddress("0x5afe000000000000000000000000000000000005");
const MODULE = getAddress("0x40d0000000000000000000000000000000000001");
const OWNER = getAddress("0x7a3f5c9e21b84dd0a6f13c8e92b7064a1c91cd02");
const STRANGER = getAddress("0x1111111111111111111111111111111111111111");
const AGENT = getAddress("0xa9e4700000000000000000000000000000000001");

const problem = (status: number, code: string) =>
  jsonResponse({ type: `/errors/${code.toLowerCase()}`, title: code, status, code }, { status, headers: { "Content-Type": "application/problem+json" } });

const vaultList = {
  vaults: [
    { safe: DEMO, module: MODULE, owner: STRANGER, isDemo: true, createdAtBlock: "0" },
    { safe: SAFE, module: MODULE, owner: OWNER, isDemo: false, createdAtBlock: "49234500" },
  ],
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/vaults")) return jsonResponse(vaultList);
    if (url.endsWith(`/vaults/${SAFE}`)) {
      return jsonResponse({ safe: SAFE, module: MODULE, owner: OWNER, agent: AGENT, isDemo: false, registered: true, explorer: "https://testnet.snowtrace.io" });
    }
    if (url.includes("/vaults/0x")) return problem(404, "VAULT_NOT_FOUND");
    return problem(500, "INTERNAL");
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("vault source in live mode (GET /vaults, GET /vaults/{safe})", () => {
  it("opens any registered vault, not only the demo one", async () => {
    const view = await fetchVaultView(SAFE);
    expect(view).toMatchObject({ safe: SAFE, module: MODULE, agent: AGENT, owners: [OWNER], isDemo: false, scenario: "none" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/v1\/vaults\/0x5afe0+1$/i);
  });

  it("a 404 means no such vault (or its module is not enabled yet): the layout shows Vault not found", async () => {
    expect(await fetchVaultView(getAddress("0x5afe0000000000000000000000000000000000ff"))).toBeNull();
  });

  it("other failures surface as errors, so the page offers Try again instead of claiming the vault is missing", async () => {
    fetchMock.mockImplementation(async () => problem(503, "CHAIN_UNAVAILABLE"));
    await expect(fetchVaultView(SAFE)).rejects.toMatchObject({ status: 503 });
  });

  it("'my vaults' are the registry rows owned by the wallet", async () => {
    const mine = await fetchMyVaults(OWNER);
    expect(mine.map((v) => v.safe)).toEqual([SAFE]);
    expect(await fetchMyVaults(getAddress("0x2222222222222222222222222222222222222222"))).toEqual([]);
  });

  it("/demo finds the demo vault from the registry when VITE_DEMO_SAFE is not set", async () => {
    expect(await fetchDemoSafe()).toBe(DEMO);
  });

  it("/demo gets null when no demo vault is registered", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ vaults: [vaultList.vaults[1]] }));
    expect(await fetchDemoSafe()).toBeNull();
  });
});
