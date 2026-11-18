import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test/apiFixtures";
import { useSession } from "@/shared/session/sessionStore";
import { Header } from "./Header";

// The admin entry exists on live data only; tests otherwise run on the simulation.
vi.mock("@/shared/api/dataSource", async (importOriginal) => ({ ...(await importOriginal<object>()), isLive: true }));
vi.mock("@/shared/session/useSignOut", () => ({ useSignOut: () => vi.fn() }));

const ADDRESS = "0x7A3f5C9e21B84dD0a6F13c8E92b7064a1c91Cd02" as const;
const fetchMock = vi.fn<typeof fetch>();

const renderHeader = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const sessionIs = (role: "admin" | "owner" | "user") =>
  fetchMock.mockImplementation(async (input) =>
    String(input).endsWith("/auth/session") ? jsonResponse({ address: ADDRESS, role, ownedVaults: [] }) : jsonResponse({}, { status: 404 }),
  );

describe("Header admin entry", () => {
  beforeAll(() => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    })) as typeof window.matchMedia;
  });
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    useSession.getState().disconnect();
  });

  it("shows the Admin button to a signed-in wallet whose server role is admin", async () => {
    sessionIs("admin");
    useSession.getState().connect(ADDRESS);
    renderHeader();
    expect(await screen.findByRole("button", { name: "Admin panel" })).toBeInTheDocument();
  });

  it.each(["owner", "user"] as const)("hides it from a %s", async (role) => {
    sessionIs(role);
    useSession.getState().connect(ADDRESS);
    renderHeader();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await screen.findByRole("button", { name: /^Account 0x/ });
    expect(screen.queryByRole("button", { name: "Admin panel" })).toBeNull();
  });

  it("does not ask the server for a role while signed out", () => {
    renderHeader();
    expect(screen.queryByRole("button", { name: "Admin panel" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
