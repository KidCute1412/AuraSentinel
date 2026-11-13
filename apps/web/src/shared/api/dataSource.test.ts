import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { DATA_SOURCE, isLive, parseAddressEnv, parseDataSource } from "./dataSource";
import { DEMO_SAFE, FIXTURE_SAFES, liveViewFromDto } from "./vaultSource";

const SAFE = getAddress("0x5afe000000000000000000000000000000000abc");

describe("data source switch", () => {
  it.each([
    [undefined, "mock"],
    ["", "mock"],
    ["mock", "mock"],
    ["Live", "live"],
    [" live ", "live"],
    ["prod", "mock"],
  ] as const)("VITE_DATA_SOURCE=%j -> %s", (raw, expected) => {
    expect(parseDataSource(raw)).toBe(expected);
  });

  it("defaults to the simulation, so tests and a fresh checkout need no backend", () => {
    expect(DATA_SOURCE).toBe("mock");
    expect(isLive).toBe(false);
    expect(DEMO_SAFE).toBe(FIXTURE_SAFES.demo);
  });

  it("accepts only a well-formed address for the demo Safe, in checksum form", () => {
    expect(parseAddressEnv(SAFE.toLowerCase())).toBe(SAFE);
    expect(parseAddressEnv(` ${SAFE} `)).toBe(SAFE);
    expect(parseAddressEnv(SAFE.toUpperCase().replace("0X", "0x"))).toBe(SAFE); // wrong checksum: normalized, never throws
    for (const bad of [undefined, "", "0x123", `${SAFE}00`, "not-an-address"]) expect(parseAddressEnv(bad)).toBeNull();
  });
});

describe("liveViewFromDto (GET /vaults/{safe}, GET /vaults rows)", () => {
  const OWNER = getAddress("0x7a3f5c9e21b84dd0a6f13c8e92b7064a1c91cd02");
  const MODULE = getAddress("0x40d0000000000000000000000000000000000abc");
  const AGENT = getAddress("0xa9e4700000000000000000000000000000000001");
  const dto = { safe: SAFE, module: MODULE, owner: OWNER, agent: AGENT, isDemo: false };

  it("maps the server's vault, the owner deciding the role on the client", () => {
    expect(liveViewFromDto(dto)).toEqual({
      safe: SAFE,
      module: MODULE,
      agent: AGENT,
      isDemo: false,
      owners: [OWNER],
      chain: { moduleEnabled: true, policyActive: true, funded: true },
      agentGas: "ok",
      scenario: "none",
    });
  });

  it("a module with no agent yet means no policy has been set", () => {
    const view = liveViewFromDto({ ...dto, agent: "0x0000000000000000000000000000000000000000" });
    expect(view.agent).toBeNull();
    expect(view.chain.policyActive).toBe(false);
  });

  it("a list row has no agent: unknown, never guessed", () => {
    const { agent: _agent, ...row } = dto;
    const view = liveViewFromDto({ ...row, isDemo: true });
    expect(view.agent).toBeNull();
    expect(view.chain.policyActive).toBe(true);
    expect(view.isDemo).toBe(true);
  });
});
