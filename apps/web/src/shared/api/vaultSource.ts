import { getAddress } from "viem";
import type { Address } from "@agentshield/shared";
import { sameAddress } from "@/shared/lib/address";

/** How a fixture vault's simulated history is seeded (see mockChain.seedSim). */
export type SeedScenario = "none" | "healthy" | "killed" | "demo" | "exhausted";

/**
 * Static facts about one vault, in the shape the real API + chain reads will return
 * (api.md GET /vaults/{safe} + Safe.getOwners + admin gas check). Fixture-backed until the backend is wired:
 * replace the bodies below, keep the signatures. Live numbers (balances, spend, jobs) are in mockChain.
 */
export interface VaultView {
  safe: Address;
  module: Address;
  agent: Address;
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

/** The public sandbox vault behind /demo. */
export const DEMO_SAFE = FIXTURE_SAFES.demo;

const LATENCY_MS = 350;
const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS));

export async function fetchVaultView(safe: Address): Promise<VaultView | null> {
  await wait();
  return FIXTURES[safe.toLowerCase()] ?? null;
}

/** GET /vaults returns the whole registry; "mine" is filtered by owner on the client (api.md §12 point 5). */
export async function fetchMyVaults(owner: Address): Promise<VaultView[]> {
  await wait();
  return Object.values(FIXTURES).filter((v) => v.owners.some((o) => sameAddress(o, owner)));
}
