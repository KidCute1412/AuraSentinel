import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOverviewDto, PreflightDto, RebalancerStatusDto } from "@agentshield/shared";
import { AGENT, SAFE, job, jsonResponse } from "@/test/apiFixtures";
import { AdminPage } from "./AdminPage";

vi.mock("@/shared/shell/Header", () => ({ Header: () => null }));
vi.mock("@/shared/shell/Footer", () => ({ Footer: () => null }));

const ME = "0x7A3f5C9e21B84dD0a6F13c8E92b7064a1c91Cd02";

const preflight: PreflightDto = {
  status: "warn",
  checkedAt: new Date().toISOString(),
  demoBudget: { left: "1300000000", cap: "1500000000" },
  checks: [
    { id: "services", label: "Services", status: "ok", detail: "Postgres, Redis, RPC and worker are up.", fix: null },
    { id: "demo-mode", label: "Demo mode", status: "warn", detail: "The rebalancer is trading on its own.", fix: "Pause it (section 02) before presenting." },
    { id: "demo-balance", label: "Vault balance", status: "fail", detail: "150 USDC in the vault.", fix: "The owner deposits USDC into the demo vault." },
  ],
};

const rebalancer = (paused: boolean): RebalancerStatusDto => ({
  paused,
  intervalMs: 15_000,
  lastTickAt: new Date(Date.now() - 20_000).toISOString(),
  lastTick: { at: new Date(Date.now() - 20_000).toISOString(), blockNumber: "123456", queued: 0, skipped: [{ safe: SAFE, reason: "balanced" }] },
  agent: { address: AGENT, avaxBalance: "50000000000000000", lowGas: false, swapsLeft: 892_857_142 },
});

const overview: AdminOverviewDto = {
  queues: [
    { name: "swap", waiting: 0, active: 0, delayed: 0, failed: 2 },
    { name: "attack", waiting: 1, active: 0, delayed: 0, failed: 0 },
    { name: "rebalance", waiting: 0, active: 0, delayed: 1, failed: 0 },
  ],
  last24h: { total: 9, confirmed: 5, rejected: 2, reverted: 1, failed: 1, attacks: 3, medianMinedMs: 1_834 },
  vaults: [{ safe: SAFE, owner: ME, module: AGENT, createdAtBlock: "100", isDemo: true, rebalanceSlot: null }],
  maxRebalancedVaults: 5,
};

const fetchMock = vi.fn<typeof fetch>();
let paused = false;

/** A small fake of the admin API, routed by path and method. */
function serve(role: "admin" | "owner" | null) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/auth/session")) return jsonResponse(role ? { address: ME, role, ownedVaults: [] } : { address: null, role: null });
    if (url.endsWith("/admin/preflight")) return jsonResponse(preflight);
    if (url.endsWith("/admin/overview")) return jsonResponse(overview);
    if (url.includes("/admin/jobs")) {
      const filter = new URL(url, "http://x").searchParams.get("filter");
      return jsonResponse({ items: filter === "failed" ? [job({ status: "failed", reasonCode: "RPC_TIMEOUT" })] : [job()], nextCursor: null });
    }
    if (url.endsWith("/admin/rebalancer/ticks") && method === "POST") return jsonResponse({ jobId: "manual-1" }, { status: 202 });
    if (url.endsWith("/admin/rebalancer")) {
      if (method === "PATCH") paused = JSON.parse(String(init!.body)).paused;
      return jsonResponse(rebalancer(paused));
    }
    return jsonResponse({}, { status: 404 });
  });
}

const renderPage = (live = true) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminPage live={live} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  paused = false;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("AdminPage access", () => {
  it("needs the live server in a mock build, and asks it nothing", () => {
    renderPage(false);
    expect(screen.getByRole("heading", { name: "Needs the live server" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks a guest to sign in with an admin wallet", async () => {
    serve(null);
    renderPage();
    expect(await screen.findByRole("heading", { name: "Sign in with an admin wallet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/signin");
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/admin/"))).toBe(false);
  });

  it("refuses a signed-in wallet that is not an admin, without calling the admin API", async () => {
    serve("owner");
    renderPage();
    expect(await screen.findByRole("heading", { name: "This wallet is not an admin" })).toBeInTheDocument();
    expect(screen.getByText("Denied")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/admin/"))).toBe(false);
  });
});

describe("AdminPage console", () => {
  it("shows the overall verdict and every check with its badge and fix", async () => {
    serve("admin");
    renderPage();
    expect(await screen.findByRole("heading", { name: /is the stage/i })).toBeInTheDocument();
    expect(await screen.findByText("Check")).toBeInTheDocument(); // overall stamp for "warn"
    const row = (await screen.findByText("Vault balance")).closest("li")!;
    expect(within(row).getByText("Fail")).toBeInTheDocument();
    expect(within(row).getByText("The owner deposits USDC into the demo vault.")).toBeInTheDocument();
    expect(screen.getByText(/1 Fail · 1 Warn · 1 OK/)).toBeInTheDocument();
    expect(screen.getByText("1,300")).toBeInTheDocument(); // demo budget left
    expect(screen.getByText("≈ 892.9M")).toBeInTheDocument(); // swaps left
  });

  it("switches Demo mode through PATCH and only lets a tick run while the rebalancer runs", async () => {
    serve("admin");
    renderPage();
    const tick = await screen.findByRole("button", { name: "Run one tick now" });
    expect(tick).toBeEnabled();
    fireEvent.click(tick);
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith("/admin/rebalancer/ticks") && i?.method === "POST")).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Demo mode" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Demo mode" })).toHaveAttribute("aria-pressed", "true"));
    const patch = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith("/admin/rebalancer") && i?.method === "PATCH");
    expect(JSON.parse(String(patch![1]!.body))).toEqual({ paused: true });
    expect(screen.getByRole("button", { name: "Run one tick now" })).toBeDisabled();
  });

  it("explains the last tick and lists activity, queues and vaults", async () => {
    serve("admin");
    renderPage();
    expect(await screen.findByText("Already balanced")).toBeInTheDocument();
    expect(await screen.findByText("Approved · 24 h")).toBeInTheDocument();
    expect(screen.getByText("2 by Shield 1 · 1 on-chain")).toBeInTheDocument();
    expect(screen.getByText("1.8 s")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "swap" })).toBeInTheDocument();
    expect(screen.getByText("Visitors only")).toBeInTheDocument();
  });

  it("pages recent jobs ten at a time with Older / Newer, grouped by day", async () => {
    serve("admin");
    const page1 = Array.from({ length: 10 }, (_, i) => job({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, createdAt: new Date().toISOString() }));
    const page2 = [job({ id: "00000000-0000-4000-8000-000000000099", reasonCode: "ExceedsPerTxCap", status: "rejected" })];
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/admin/jobs")) {
        const cursor = new URL(url, "http://x").searchParams.get("cursor");
        return jsonResponse(cursor ? { items: page2, nextCursor: null } : { items: page1, nextCursor: page1[9]!.id });
      }
      return base(input, init);
    });
    renderPage();
    const older = await screen.findByRole("button", { name: /older/i });
    expect(screen.getByRole("button", { name: /newer/i })).toBeDisabled();
    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Today" })).toBeInTheDocument();
    fireEvent.click(older);
    expect(await screen.findByText("ExceedsPerTxCap")).toBeInTheDocument();
    expect(screen.getByText("Page 2")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes(`cursor=${page1[9]!.id}`))).toBe(true);
    expect(screen.getByRole("button", { name: /older/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /newer/i }));
    expect(await screen.findByText("Page 1")).toBeInTheDocument();
  });

  it("filters recent jobs with the Failed tab", async () => {
    serve("admin");
    renderPage();
    const failed = await screen.findByRole("tab", { name: "Failed" });
    fireEvent.click(failed);
    expect(failed).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("RPC_TIMEOUT")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/admin/jobs?filter=failed"))).toBe(true);
  });
});
