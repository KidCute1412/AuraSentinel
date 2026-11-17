import { describe, expect, it } from "vitest";
import { state } from "@/test/apiFixtures";
import { cardStatus, countByFilter, matchesFilter, matchesQuery, parseFilter } from "./vaultList";

const NOW = 1_790_000_000;

describe("cardStatus", () => {
  it("an active policy is Protected, with no flags", () => {
    expect(cardStatus(state, "ready", NOW)).toEqual({ status: "active", expired: false, empty: false, stale: false });
  });

  it("an expired policy stays Protected (the owner never pressed Kill) but is flagged", () => {
    expect(cardStatus({ ...state, policy: { ...state.policy, expiry: NOW } }, "ready", NOW)).toMatchObject({ status: "active", expired: true });
  });

  it("after the Kill-Switch: Revoked", () => {
    expect(cardStatus({ ...state, isActive: false }, "ready", NOW).status).toBe("revoked");
  });

  it("a module that never got a policy is Incomplete (wizard not finished)", () => {
    const fresh = { ...state, isActive: false, policyEpoch: 0, policy: { ...state.policy, agentSigner: "0x0000000000000000000000000000000000000000" as const } };
    expect(cardStatus(fresh, "ready", NOW).status).toBe("incomplete");
  });

  it("no state: Unknown while loading or unreadable, Incomplete when the source says there is none", () => {
    expect(cardStatus(null, "loading", NOW).status).toBe("unknown");
    expect(cardStatus(null, "unavailable", NOW).status).toBe("unknown");
    expect(cardStatus(null, "ready", NOW).status).toBe("incomplete");
  });

  it("flags an empty vault and a stale snapshot", () => {
    const empty = { ...state, stale: true, balances: state.balances.map((b) => ({ ...b, amount: "0" })) };
    expect(cardStatus(empty, "ready", NOW)).toMatchObject({ status: "active", empty: true, stale: true });
  });
});

describe("filters and search", () => {
  it("unknown filter values fall back to All", () => {
    expect(parseFilter(null)).toBe("all");
    expect(parseFilter("revoked")).toBe("revoked");
    expect(parseFilter("hacked")).toBe("all");
  });

  it("a vault whose status is unknown only shows under All", () => {
    expect(matchesFilter("unknown", "all")).toBe(true);
    expect(matchesFilter("unknown", "active")).toBe(false);
    expect(matchesFilter("revoked", "revoked")).toBe(true);
  });

  it("search matches part of an address, with or without 0x, any case", () => {
    const addrs = ["0xcA435Ab856EDdD8c15b83D16672230b916737A8f"];
    expect(matchesQuery(addrs, "")).toBe(true);
    expect(matchesQuery(addrs, "ca435")).toBe(true);
    expect(matchesQuery(addrs, "0XCA435AB")).toBe(true);
    expect(matchesQuery(addrs, "beef")).toBe(false);
  });

  it("counts per filter", () => {
    expect(countByFilter(["active", "active", "revoked", "incomplete", "unknown"])).toEqual({ all: 5, active: 2, revoked: 1, incomplete: 1 });
  });
});
