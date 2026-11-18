import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test/apiFixtures";
import { AdminEntry, isDashboardPath } from "./AdminEntry";

const ADMIN = "0x7A3f5C9e21B84dD0a6F13c8E92b7064a1c91Cd02";
const fetchMock = vi.fn<typeof fetch>();
let qc: QueryClient;

const renderAt = (path: string, live = true) =>
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AdminEntry live={live} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const session = (role: "user" | "owner" | "admin" | null) =>
  role ? { address: ADMIN, role, ownedVaults: [] } : { address: null, role: null };

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("isDashboardPath", () => {
  it("covers /demo and the /vaults pages only", () => {
    for (const p of ["/demo", "/vaults", "/vaults/new", `/vaults/${ADMIN}`, `/vaults/${ADMIN}/red-team`]) expect(isDashboardPath(p)).toBe(true);
    for (const p of ["/", "/proof", "/about", "/signin", "/demonstration", "/vaultsx"]) expect(isDashboardPath(p)).toBe(false);
  });
});

describe("AdminEntry", () => {
  it("shows the Admin button on the dashboard when the server session is admin", async () => {
    fetchMock.mockResolvedValue(jsonResponse(session("admin")));
    renderAt("/demo");
    expect(await screen.findByRole("button", { name: "Admin panel" })).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/api\/v1\/auth\/session$/);
  });

  it("stays hidden for guests, users and owners", async () => {
    for (const role of [null, "user", "owner"] as const) {
      fetchMock.mockResolvedValue(jsonResponse(session(role)));
      const { unmount } = renderAt(`/vaults/${ADMIN}`);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByRole("button", { name: "Admin panel" })).toBeNull();
      unmount();
      fetchMock.mockReset();
      qc.clear();
    }
  });

  it("stays hidden off the dashboard, even for an admin", async () => {
    fetchMock.mockResolvedValue(jsonResponse(session("admin")));
    renderAt("/proof");
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: "Admin panel" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing in mock mode: there is no server to be admin of", async () => {
    renderAt("/demo", false);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: "Admin panel" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
