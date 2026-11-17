import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { Address, JobDto, StateDto } from "@agentshield/shared";
import { isLive } from "@/shared/api/dataSource";
import { getJobs, getVaultState } from "@/shared/api/endpoints";
import { useMockChain } from "@/shared/api/mockChain";
import { queryKeys } from "@/shared/api/queryKeys";
import { fetchMyVaults, type VaultView } from "@/shared/api/vaultSource";
import type { LoadStatus } from "./vaultList";

/** The connected wallet's vaults from the registry (GET /vaults, filtered by owner), newest first. */
export function useMyVaultList(owner: Address | null) {
  return useQuery({
    queryKey: [...queryKeys.vaults, "owner", (owner ?? "none").toLowerCase()],
    queryFn: () => fetchMyVaults(owner!),
    enabled: !!owner,
    retry: 1,
  });
}

export interface VaultRead {
  state: StateDto | null;
  load: LoadStatus;
}

const SNAPSHOT_REFRESH_MS = 15_000;

/**
 * Chain state of every listed vault, one GET /vaults/{safe}/state each (same cache entry as the dashboard). The
 * status filter needs them all; an owner's list is short. One failing read only marks that card.
 */
function useLiveVaultReads(views: readonly VaultView[]): Record<string, VaultRead> {
  const results = useQueries({
    queries: views.map((v) => ({
      queryKey: queryKeys.vaultState(v.safe),
      queryFn: ({ signal }: { signal: AbortSignal }) => getVaultState(v.safe, signal),
      staleTime: 1_000,
      refetchInterval: SNAPSHOT_REFRESH_MS,
      retry: 1,
    })),
  });
  return Object.fromEntries(
    views.map((v, i) => {
      const r = results[i]!;
      return [v.safe.toLowerCase(), { state: r.data ?? null, load: r.data ? "ready" : r.isError ? "unavailable" : "loading" }];
    }),
  );
}

/** Mock: each fixture's simulated state; a fixture that never finished the wizard has none (seedSim returns null). */
function useMockVaultReads(views: readonly VaultView[]): Record<string, VaultRead> {
  const ensure = useMockChain((s) => s.ensure);
  const sims = useMockChain((s) => s.sims);
  useEffect(() => views.forEach((v) => ensure(v)), [views, ensure]);
  return useMemo(
    () =>
      Object.fromEntries(
        views.map((v) => {
          const sim = sims[v.safe.toLowerCase()];
          const setUp = v.chain.moduleEnabled && v.chain.policyActive;
          return [v.safe.toLowerCase(), { state: sim?.state ?? null, load: sim || !setUp ? "ready" : "loading" }];
        }),
      ),
    [views, sims],
  );
}

export const useVaultReads: (views: readonly VaultView[]) => Record<string, VaultRead> = isLive ? useLiveVaultReads : useMockVaultReads;

/** The newest job of one vault (live: GET /vaults/{safe}/jobs?limit=1), or null when it has none. undefined = loading. */
function useLiveLatestJob(view: VaultView): JobDto | null | undefined {
  const q = useQuery({
    queryKey: [...queryKeys.vaultJobs(view.safe), "latest"],
    queryFn: ({ signal }) => getJobs(view.safe, { limit: 1 }, signal),
    staleTime: 10_000,
    retry: 1,
  });
  if (q.isError) return null;
  return q.data ? (q.data.items[0] ?? null) : undefined;
}

function useMockLatestJob(view: VaultView): JobDto | null | undefined {
  const sim = useMockChain((s) => s.sims[view.safe.toLowerCase()]);
  return sim ? (sim.jobs[0] ?? null) : null;
}

export const useLatestJob: (view: VaultView) => JobDto | null | undefined = isLive ? useLiveLatestJob : useMockLatestJob;
