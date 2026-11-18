import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test/apiFixtures";
import { AdminEntry } from "./AdminEntry";

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

describe("AdminEntry", () => {
  it("links an admin to the console from any page, marked current on /admin", async () => {
    fetchMock.mockResolvedValue(jsonResponse(session("admin")));
    const { unmount } = renderAt("/proof");
    const link = await screen.findByRole("link", { name: "Admin console" });
    expect(link).toHaveAttribute("href", "/admin");
    expect(link).not.toHaveAttribute("aria-current");
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/api\/v1\/auth\/session$/);
    unmount();

    renderAt("/admin");
    expect(await screen.findByRole("link", { name: "Admin console" })).toHaveAttribute("aria-current", "page");
  });

  it("stays hidden for guests, users and owners", async () => {
    for (const role of [null, "user", "owner"] as const) {
      fetchMock.mockResolvedValue(jsonResponse(session(role)));
      const { unmount } = renderAt(`/vaults/${ADMIN}`);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByRole("link", { name: "Admin console" })).toBeNull();
      unmount();
      fetchMock.mockReset();
      qc.clear();
    }
  });

  it("does nothing in mock mode: there is no server to be admin of", async () => {
    renderAt("/demo", false);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link", { name: "Admin console" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
