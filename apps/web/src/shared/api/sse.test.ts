import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource } from "@/test/fakeEventSource";
import { job, OTHER_SAFE, SAFE, TX } from "@/test/apiFixtures";
import { backoffDelay, connectVaultEvents, parseServerEvent, type SseStatus } from "./sse";

beforeEach(() => {
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const updated = { type: "job.updated", vault: SAFE, job: job() };

describe("parseServerEvent", () => {
  it("accepts a valid event for this vault (address case ignored)", () => {
    expect(parseServerEvent(JSON.stringify(updated), SAFE.toUpperCase().replace("0X", "0x"))?.type).toBe("job.updated");
  });

  it.each([
    ["not JSON", "{oops"],
    ["unknown type", JSON.stringify({ type: "job.deleted", vault: SAFE })],
    ["missing vault", JSON.stringify({ type: "chain.revoked", txHash: TX })],
    [
      "float money",
      JSON.stringify({ type: "chain.swap", vault: SAFE, tokenIn: SAFE, tokenOut: SAFE, amountIn: "1.5", amountOut: "1", spentToday: "1", txHash: TX }),
    ],
    ["another vault", JSON.stringify({ ...updated, vault: OTHER_SAFE })],
  ])("drops %s", (_name, raw) => {
    expect(parseServerEvent(raw, SAFE)).toBeNull();
  });
});

describe("connectVaultEvents", () => {
  it("opens the vault stream with credentials and delivers only valid events", () => {
    const onEvent = vi.fn();
    connectVaultEvents(SAFE, { onEvent });
    const es = FakeEventSource.last;
    expect(es.url).toBe(`/api/v1/vaults/${SAFE}/events`);
    expect(es.withCredentials).toBe(true);

    es.open();
    es.message("{not json");
    es.message({ type: "chain.revoked", vault: SAFE, txHash: "0x12" });
    es.message(updated);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0].type).toBe("job.updated");
  });

  it("reconnects with backoff and reports every reopen so snapshots get refetched", () => {
    const onOpen = vi.fn();
    const statuses: SseStatus[] = [];
    connectVaultEvents(SAFE, { onEvent: vi.fn(), onOpen, onStatus: (s) => statuses.push(s) });

    FakeEventSource.last.open();
    expect(onOpen).toHaveBeenLastCalledWith({ reconnect: false });

    FakeEventSource.last.fail();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
    vi.advanceTimersByTime(999);
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(2);

    FakeEventSource.last.open();
    expect(onOpen).toHaveBeenLastCalledWith({ reconnect: true });
    expect(statuses).toEqual(["connecting", "open", "reconnecting", "reconnecting", "open"]);
  });

  it("backs off 1s, 2s, 4s while the server is down, and resets after a successful open", () => {
    connectVaultEvents(SAFE, { onEvent: vi.fn() });
    FakeEventSource.last.fail();
    vi.advanceTimersByTime(1_000); // attempt 2
    FakeEventSource.last.fail();
    vi.advanceTimersByTime(1_999);
    expect(FakeEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1); // attempt 3 after 2s
    expect(FakeEventSource.instances).toHaveLength(3);

    FakeEventSource.last.open();
    FakeEventSource.last.fail();
    vi.advanceTimersByTime(1_000); // back to 1s
    expect(FakeEventSource.instances).toHaveLength(4);
  });

  it("caps the delay", () => {
    expect([0, 1, 2, 3].map((a) => backoffDelay(a))).toEqual([1_000, 2_000, 4_000, 8_000]);
    expect(backoffDelay(50)).toBe(30_000);
  });

  it("stops for good when closed", () => {
    const onStatus = vi.fn();
    const close = connectVaultEvents(SAFE, { onEvent: vi.fn(), onStatus });
    FakeEventSource.last.fail();
    close();
    vi.advanceTimersByTime(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(onStatus).toHaveBeenLastCalledWith("closed");
  });
});
