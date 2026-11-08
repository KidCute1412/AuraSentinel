import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { applyServerEvent } from "./cache";
import { getJob, getJobs, getSession, getVaultState } from "./endpoints";
import { queryKeys } from "./queryKeys";
import { connectVaultEvents, type Backoff, type SseStatus } from "./sse";

/** Vault snapshot from GET /vaults/{safe}/state. Fresh for 1s, matching the server cache; SSE keeps it current. */
export function useVaultState(safe: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.vaultState(safe ?? ""),
    queryFn: ({ signal }) => getVaultState(safe as string, signal),
    enabled: Boolean(safe),
    staleTime: 1_000,
  });
}

/** First page of jobs (newest first). `job.updated` events upsert into it. */
export function useJobs(safe: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.vaultJobs(safe ?? ""),
    queryFn: ({ signal }) => getJobs(safe as string, {}, signal),
    enabled: Boolean(safe),
  });
}

/** One job with its audit trail. */
export function useJob(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.job(id ?? ""),
    queryFn: ({ signal }) => getJob(id as string, signal),
    enabled: Boolean(id),
  });
}

/** SIWE session (owner/admin only, D12). Guests get `{ address: null, role: null }`. */
export function useSession() {
  return useQuery({ queryKey: queryKeys.session, queryFn: ({ signal }) => getSession(signal), staleTime: 60_000 });
}

/**
 * Live updates for one vault. Mount once per page (see app/realtime-bridge.tsx). On every open,
 * first connect included, it refetches `/state` and `/jobs`: events sent while disconnected are
 * lost, and the snapshot fetched before the stream opened may already be behind.
 */
export function useVaultEvents(safe: string | null | undefined, options: { enabled?: boolean; backoff?: Backoff } = {}): SseStatus {
  const { enabled = true, backoff } = options;
  const qc = useQueryClient();
  const [status, setStatus] = useState<SseStatus>("closed");

  useEffect(() => {
    if (!safe || !enabled) return;
    return connectVaultEvents(safe, {
      backoff,
      onStatus: setStatus,
      onEvent: (event) => applyServerEvent(qc, safe, event),
      onOpen: () => {
        void qc.invalidateQueries({ queryKey: queryKeys.vaultState(safe) });
        void qc.invalidateQueries({ queryKey: queryKeys.vaultJobs(safe) });
      },
    });
    // `backoff` is left out on purpose: it only tunes retries, a new object must not reconnect.
  }, [qc, safe, enabled]);

  return status;
}
