import { getAddress } from "viem";
import type { Address } from "@agentshield/shared";
import { sameAddress } from "@/shared/lib/address";

/**
 * Everything the vault pages need to know about one vault, in the shape the real API + chain reads will return
 * (api.md GET /vaults/{safe} + Safe.getOwners + GET .../state). Fixture-backed until the backend is wired:
 * replace the bodies below, keep the signatures.
 */
export interface VaultView {
  safe: Address;
  module: Address;
  agent: Address;
  isDemo: boolean;
  /** Safe.getOwners(). The role is derived from this on the client, backend only double-checks. */
  owners: Address[];
  chain: { moduleEnabled: boolean; policyActive: boolean; funded: boolean };
  /** null while the vault is not set up far enough to have a policy. */
  state: { isActive: boolean; budgetUsedPct: number; stale: boolean } | null;
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
  state: { isActive: true, budgetUsedPct: 13.3, stale: false },
  ...over,
});

export const FIXTURES: Record<string, VaultView> = Object.fromEntries(
  [
    vault(1), // healthy
    vault(2, { state: { isActive: false, budgetUsedPct: 40, stale: false } }), // killed
    vault(3, { chain: { moduleEnabled: false, policyActive: false, funded: false }, state: null }), // wizard stopped at step 2
    vault(4, { chain: { moduleEnabled: true, policyActive: false, funded: false }, state: null }), // wizard stopped at step 3
    vault(5, { isDemo: true, owners: [FIXTURE_STRANGER], state: { isActive: true, budgetUsedPct: 87.5, stale: false } }), // public demo vault
  ].map((v) => [v.safe.toLowerCase(), v]),
);

export const FIXTURE_SAFES = {
  healthy: vault(1).safe,
  killed: vault(2).safe,
  stoppedAtModule: vault(3).safe,
  stoppedAtPolicy: vault(4).safe,
  demo: vault(5).safe,
} as const;

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
