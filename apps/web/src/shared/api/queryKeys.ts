/** Addresses are lower-cased so 0xAbC and 0xabc share one cache entry (api.md: `{safe}` is case-insensitive). */
const v = (safe: string) => safe.toLowerCase();

export const queryKeys = {
  vault: (safe: string) => ["vault", v(safe)] as const,
  vaultState: (safe: string) => ["vault", v(safe), "state"] as const,
  vaultJobs: (safe: string) => ["vault", v(safe), "jobs"] as const,
  job: (id: string) => ["job", id] as const,
  vaults: ["vaults"] as const,
  session: ["auth", "session"] as const,
  adminRebalancer: ["admin", "rebalancer"] as const,
};
