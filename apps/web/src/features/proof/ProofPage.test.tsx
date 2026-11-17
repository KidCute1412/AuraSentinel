import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProofDto } from "@agentshield/shared";
import { FUJI_DEPLOYMENT } from "@/shared/web3/deployments";
import { ProofPage } from "./ProofPage";

vi.mock("@/shared/shell/Header", () => ({ Header: () => null }));
vi.mock("@/shared/shell/Footer", () => ({ Footer: () => null }));

const contracts: ProofDto["contracts"] = [
  { name: "AgentPolicyModule", address: FUJI_DEPLOYMENT.publicModule, verified: true, explorerUrl: `https://testnet.snowtrace.io/address/${FUJI_DEPLOYMENT.publicModule}` },
  { name: "AgentShieldFactory", address: FUJI_DEPLOYMENT.factory, verified: true, explorerUrl: `https://testnet.snowtrace.io/address/${FUJI_DEPLOYMENT.factory}` },
];
const notRun: ProofDto = {
  network: { name: "Avalanche Fuji", chainId: 43113 },
  contracts,
  finality: { samples: 0, avgMs: 0, minMs: 0, maxMs: 0, recentMs: [] },
  tests: { fuzzRuns: 0, invariants: [], passed: false, slither: "not run" },
  blockedTxs: [],
};
const measured: ProofDto = {
  ...notRun,
  finality: { samples: 3, avgMs: 1800, minMs: 1500, maxMs: 2100, recentMs: [1500, 1800, 2100] },
  tests: { fuzzRuns: 10000, invariants: ["invariant_spentNeverExceedsDailyCap", "invariant_attackerNeverReceivesTokens"], passed: true, slither: "0 high, 0 medium" },
};

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProofPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false, onchange: null })) as typeof window.matchMedia;
  window.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("/proof", () => {
  it("server offline: lists the real deployed addresses and never shows made-up numbers", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();
    expect(await screen.findByText("Server offline")).toBeInTheDocument();
    expect(screen.getByText(FUJI_DEPLOYMENT.publicModule)).toBeInTheDocument();
    expect(screen.getByText(FUJI_DEPLOYMENT.factory)).toBeInTheDocument();
    expect(screen.queryByText("Verified")).toBeNull(); // not asked, so not claimed
    expect(screen.queryByText(/0x5a3e/)).toBeNull();
    expect(screen.queryByText(/sample/i)).toBeNull();
    expect(screen.getAllByText(/offline right now/)).toHaveLength(3);
  });

  it("tests not run yet: says so instead of FAILING, and no finality number before any sample", async () => {
    fetchMock.mockResolvedValue(json(notRun));
    renderPage();
    expect(await screen.findByText("contract test suite not run yet")).toBeInTheDocument();
    expect(screen.queryByText(/FAILING|Failing/)).toBeNull();
    expect(screen.getByText("no agent transaction measured yet")).toBeInTheDocument();
    expect(screen.getByText(/test report has not been published/)).toBeInTheDocument();
    expect(screen.getAllByText("Verified")).toHaveLength(2);
  });

  it("measured: shows the server's numbers and the invariant names", async () => {
    fetchMock.mockResolvedValue(json(measured));
    renderPage();
    expect(await screen.findByText("invariant_spentNeverExceedsDailyCap")).toBeInTheDocument();
    expect(screen.getByText("Passing")).toBeInTheDocument();
    expect(screen.getAllByText("1.80s").length).toBeGreaterThan(0); // hero tile + finality section
    expect(screen.getAllByText(/0 high, 0 medium/).length).toBeGreaterThan(0);
  });
});
