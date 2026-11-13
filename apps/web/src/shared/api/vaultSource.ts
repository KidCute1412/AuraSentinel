import { getAddress } from "viem";
import type { Address, VaultDto } from "@agentshield/shared";
import { sameAddress } from "@/shared/lib/address";
import { ApiError } from "./client";
import { isLive, LIVE_DEMO_SAFE } from "./dataSource";
import { getVault, getVaults } from "./endpoints";

/** How a fixture vault's simulated history is seeded (see mockChain.seedSim). */
export type SeedScenario = "none" | "healthy" | "killed" | "demo" | "exhausted";

/**
 * Static facts about one vault, in the shape the real API + chain reads will return
 * (api.md GET /vaults/{safe} + Safe.getOwners + admin gas check). Fixture-backed until the backend is wired:
 * replace the bodies below, keep the signatures. Live numbers (balances, spend, jobs) are in mockChain.
 * In live mode (shared/api/dataSource.ts) views come from GET /vaults/{safe} and GET /vaults instead (liveViewFromDto).
 */
export interface VaultView {
  safe: Address;
  /** null when unknown: a GET /vaults row has no agent, and a vault without a policy has none. */
  module: Address | null;
  agent: Address | null;
  isDemo: boolean;
  /** Safe.getOwners(). The role is derived from this on the client, backend only double-checks. */
  owners: Address[];
  chain: { moduleEnabled: boolean; policyActive: boolean; funded: boolean };
  /** "low" blocks Run/attack with a clear message (api: AGENT_LOW_GAS). */
  agentGas: "ok" | "low";
  /** Mock only: which history to seed. */
  scenario: SeedScenario;
  /** Mock only: simulates an RPC outage (state.stale = true). */
  stale?: boolean;
}

const a = (hex: string): Address => getAddress(hex.toLowerCase());

/** Matches MOCK_ADDRESS in the access gate, so signing in as the mock "returning owner" owns these vaults. */
export const FIXTURE_OWNER = a("0x7A3f5C9e21B84dD0a6F13c8E92b7064a1c91Cd02");
export const FIXTURE_STRANGER = a("0x1111111111111111111111111111111111111111");
const AGENT = a("0xa9e4700000000000000000000000000000000001");

const vault = (n: number, over: Partial<VaultView> = {}): VaultView => ({
  safe: a(`0x5afe${n.toString(16).padStart(36, "0")}`),
  module: a(`0x40d0${n.toString(16).padStart(36, "0")}`),
  agent: AGENT,
  isDemo: false,
  owners: [FIXTURE_OWNER],
  chain: { moduleEnabled: true, policyActive: true, funded: true },
  agentGas: "ok",
  scenario: "healthy",
  ...over,
});

const NOT_READY = { moduleEnabled: false, policyActive: false, funded: false } as const;

const ALL: VaultView[] = [
  vault(1), // healthy
  vault(2, { scenario: "killed" }), // killed by the owner
  vault(3, { chain: { ...NOT_READY }, scenario: "none" }), // wizard stopped at step 2
  vault(4, { chain: { ...NOT_READY, moduleEnabled: true }, scenario: "none" }), // wizard stopped at step 3
  vault(5, { isDemo: true, owners: [FIXTURE_STRANGER], scenario: "demo" }), // public demo vault, budget nearly used
  vault(6, { stale: true }), // RPC outage
  vault(7, { scenario: "exhausted" }), // daily budget used up
  vault(8, { agentGas: "low" }), // agent is out of gas
];

export const FIXTURES: Record<string, VaultView> = Object.fromEntries(ALL.map((v) => [v.safe.toLowerCase(), v]));

export const FIXTURE_SAFES = {
  healthy: ALL[0].safe,
  killed: ALL[1].safe,
  stoppedAtModule: ALL[2].safe,
  stoppedAtPolicy: ALL[3].safe,
  demo: ALL[4].safe,
  stale: ALL[5].safe,
  exhausted: ALL[6].safe,
  lowGas: ALL[7].safe,
} as const;

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Live mode: a vault as the server describes it (GET /vaults/{safe} or a GET /vaults row). The server answers 404
 * until the module is enabled, so any vault it returns has one; a policy is set once the module names an agent.
 * The list rows carry no agent: shown as unknown rather than guessed.
 */
export function liveViewFromDto(v: Pick<VaultDto, "safe" | "module" | "owner" | "isDemo"> & { agent?: Address | null }): VaultView {
  const agent = v.agent && !sameAddress(v.agent, ZERO) ? v.agent : null;
  return {
    safe: v.safe,
    module: v.module,
    agent,
    isDemo: v.isDemo,
    owners: [v.owner],
    chain: { moduleEnabled: true, policyActive: v.agent === undefined ? true : agent !== null, funded: true },
    agentGas: "ok", // the server answers AGENT_LOW_GAS on a button press when it is not
    scenario: "none",
  };
}

/** The public sandbox vault behind /demo, when known without a request (mock fixture, or VITE_DEMO_SAFE in live). */
export const DEMO_SAFE: Address | null = isLive ? LIVE_DEMO_SAFE : FIXTURE_SAFES.demo;

/** /demo: VITE_DEMO_SAFE when set, otherwise the vault the server flags isDemo. null = no demo vault deployed. */
export async function fetchDemoSafe(): Promise<Address | null> {
  if (DEMO_SAFE) return DEMO_SAFE;
  if (!isLive) return null;
  const { vaults } = await getVaults();
  return vaults.find((v) => v.isDemo)?.safe ?? null;
}

const LATENCY_MS = 350;
const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS));

export async function fetchVaultView(safe: Address): Promise<VaultView | null> {
  if (isLive) {
    try {
      return liveViewFromDto(await getVault(safe));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null; // not a vault, or its module is not enabled yet
      throw e;
    }
  }
  await wait();
  return FIXTURES[safe.toLowerCase()] ?? null;
}

/** GET /vaults returns the whole registry; "mine" is filtered by owner on the client (api.md §12 point 5). */
export async function fetchMyVaults(owner: Address): Promise<VaultView[]> {
  if (isLive) {
    const { vaults } = await getVaults();
    return vaults.filter((v) => sameAddress(v.owner, owner)).map(liveViewFromDto);
  }
  await wait();
  return Object.values(FIXTURES).filter((v) => v.owners.some((o) => sameAddress(o, owner)));
}
