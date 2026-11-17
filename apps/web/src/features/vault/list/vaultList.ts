import type { StateDto } from "@agentshield/shared";
import type { VaultStatus } from "@/shared/ui/StatusBadge";

/**
 * Pure rules behind /vaults ("My vaults", ui-pages.md §11). Status comes from the chain-sourced state (P1); the
 * registry (GET /vaults) only says which vaults exist and who owns them.
 */

export type LoadStatus = "loading" | "ready" | "unavailable";

export interface CardStatus {
  status: VaultStatus;
  /** Active, but the policy expiry has passed: the agent cannot trade until the owner sets a new policy. */
  expired: boolean;
  /** Set up, but holds no tokens: nothing for the agent to manage yet. */
  empty: boolean;
  /** The server could not reach the chain and served its last snapshot. */
  stale: boolean;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * - no state yet: unknown (still loading, or unreadable)
 * - ready with no state, or a module that never got a policy (epoch 0, no agent): incomplete (wizard not finished)
 * - Kill-Switch pressed: revoked
 * - otherwise active, flagged expired / empty when it applies
 */
export function cardStatus(state: StateDto | null, load: LoadStatus, nowSec: number): CardStatus {
  const none = { expired: false, empty: false, stale: false };
  if (!state) return { status: load === "ready" ? "incomplete" : "unknown", ...none };
  const flags = { stale: state.stale, empty: state.balances.every((b) => b.amount === "0") };
  if (state.policyEpoch === 0 || state.policy.agentSigner.toLowerCase() === ZERO) return { status: "incomplete", ...flags, expired: false };
  if (!state.isActive) return { status: "revoked", ...flags, expired: false };
  return { status: "active", ...flags, expired: state.policy.expiry <= nowSec };
}

/** Filter values, as they appear in the URL (?status=). "all" is the default and is left out of the URL. */
export const FILTERS = ["all", "active", "revoked", "incomplete"] as const;
export type Filter = (typeof FILTERS)[number];

export const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  active: "Protected",
  revoked: "Revoked",
  incomplete: "Incomplete",
};

export const parseFilter = (v: string | null): Filter => (FILTERS as readonly string[]).includes(v ?? "") ? (v as Filter) : "all";

/** Search box: part of the Safe or module address, with or without 0x, any case. */
export function matchesQuery(addresses: readonly string[], query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^0x/, "");
  if (q === "") return true;
  return addresses.some((a) => a.toLowerCase().replace(/^0x/, "").includes(q));
}

/** Matches the filter. A vault whose status is not known yet only shows under "All". */
export const matchesFilter = (status: VaultStatus, filter: Filter): boolean => filter === "all" || status === filter;

/** Count per filter, for the tab labels. */
export function countByFilter(statuses: readonly VaultStatus[]): Record<Filter, number> {
  return {
    all: statuses.length,
    active: statuses.filter((s) => s === "active").length,
    revoked: statuses.filter((s) => s === "revoked").length,
    incomplete: statuses.filter((s) => s === "incomplete").length,
  };
}
