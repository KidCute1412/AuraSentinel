import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT, jsonResponse } from "@/test/apiFixtures";
import { AdminDrawer } from "./AdminDrawer";

const fetchMock = vi.fn<typeof fetch>();
let qc: QueryClient;
const wrap = (ui: ReactNode) => <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
const status = (paused: boolean, lowGas = false) => ({
  paused,
  intervalMs: 15_000,
  lastTickAt: null,
  agent: { address: AGENT, avaxBalance: "5000000000000000000", lowGas },
});

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("AdminDrawer", () => {
  it("renders nothing for guests, users and owners, and calls no admin API", () => {
    for (const role of [null, undefined, "user", "owner"] as const) {
      const { container, unmount } = render(wrap(<AdminDrawer role={role} />));
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens for admins and closes on Escape", async () => {
    fetchMock.mockResolvedValue(jsonResponse(status(false)));
    render(wrap(<AdminDrawer role="admin" />));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled(); // fetched only once opened

    fireEvent.click(screen.getByRole("button", { name: /admin/i }));
    expect(screen.getByRole("dialog", { name: "Admin panel" })).toBeInTheDocument();
    await screen.findByText(/RUNNING/);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("toggles Demo mode through PATCH /admin/rebalancer and shows the agent's gas", async () => {
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === "PATCH" ? jsonResponse(status(true, true)) : jsonResponse(status(false)),
    );
    render(wrap(<AdminDrawer role="admin" />));
    fireEvent.click(screen.getByRole("button", { name: /admin/i }));

    fireEvent.click(await screen.findByRole("button", { name: "Pause rebalancer" }));
    await screen.findByRole("button", { name: "Resume rebalancer" });
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(String(patch![0])).toMatch(/\/api\/v1\/admin\/rebalancer$/);
    expect(JSON.parse(String(patch![1]!.body))).toEqual({ paused: true });
    expect(screen.getByText(/PAUSED/)).toBeInTheDocument();
    expect(screen.getByText("5 AVAX")).toBeInTheDocument();
    expect(screen.getByText("Low gas")).toBeInTheDocument();
  });

  it("says so when the admin API is not reachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(wrap(<AdminDrawer role="admin" />));
    fireEvent.click(screen.getByRole("button", { name: /admin/i }));
    await waitFor(() => expect(screen.getByText(/Cannot reach the admin API/)).toBeInTheDocument());
  });
});
