import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource } from "@/test/fakeEventSource";
import { job, jsonResponse, SAFE, state } from "@/test/apiFixtures";
import { useJobs, useVaultEvents, useVaultState } from "./hooks";

const fetchMock = vi.fn<typeof fetch>();
let qc: QueryClient;

beforeEach(() => {
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/state")) return jsonResponse(state);
    if (url.includes("/jobs")) return jsonResponse({ items: [job()], nextCursor: null });
    return new Response(null, { status: 404 });
  });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const calls = (suffix: string) => fetchMock.mock.calls.filter(([u]) => String(u).includes(suffix)).length;

function useDashboard() {
  const sse = useVaultEvents(SAFE, { backoff: { initialMs: 1, maxMs: 1 } });
  return { state: useVaultState(SAFE), jobs: useJobs(SAFE), sse };
}

describe("data hooks + SSE bridge", () => {
  it("loads the snapshot and refetches it after every SSE (re)open", async () => {
    const { result } = renderHook(useDashboard, { wrapper });
    await waitFor(() => expect(result.current.state.data?.isActive).toBe(true));
    const stateBefore = calls("/state");
    const jobsBefore = calls("/jobs");

    act(() => FakeEventSource.last.open());
    await waitFor(() => expect(calls("/state")).toBe(stateBefore + 1));
    expect(result.current.sse).toBe("open");

    // Connection drops, reconnects after the backoff, and the snapshot is fetched again.
    act(() => FakeEventSource.last.fail());
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    act(() => FakeEventSource.last.open());
    await waitFor(() => expect(calls("/state")).toBe(stateBefore + 2));
    await waitFor(() => expect(calls("/jobs")).toBe(jobsBefore + 2));
  });

  it("applies valid events to the cache and ignores invalid ones", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(useDashboard, { wrapper });
    await waitFor(() => expect(result.current.jobs.data?.items).toHaveLength(1));

    act(() => FakeEventSource.last.message({ type: "job.updated", vault: SAFE, job: { ...job(), status: "nope" } }));
    expect(result.current.jobs.data!.items[0]!.status).toBe("queued");

    act(() => FakeEventSource.last.message({ type: "job.updated", vault: SAFE, job: job({ status: "simulating" }) }));
    await waitFor(() => expect(result.current.jobs.data!.items[0]!.status).toBe("simulating"));
  });

  it("closes the stream on unmount", () => {
    const { unmount } = renderHook(useDashboard, { wrapper });
    const es = FakeEventSource.last;
    unmount();
    expect(es.closed).toBe(true);
  });
});
