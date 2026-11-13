import { useQuery } from "@tanstack/react-query";
import type { Address } from "@agentshield/shared";
import { DEMO_SAFE, fetchDemoSafe, fetchVaultView } from "./vaultSource";

/** Query key convention from ui-pages.md §8: ["vault", safe, ...]. */
export const vaultKeys = {
  view: (safe: string) => ["vault", safe.toLowerCase(), "view"] as const,
  demoSafe: ["vault", "demo-safe"] as const,
};

export function useVaultView(safe: Address | null) {
  return useQuery({
    queryKey: vaultKeys.view(safe ?? "none"),
    queryFn: () => fetchVaultView(safe!),
    enabled: !!safe,
  });
}

/**
 * The Safe behind /demo. Known up front in mock mode or with VITE_DEMO_SAFE (no request, no extra render); otherwise
 * the live server is asked which registered vault is the demo one (GET /vaults, isDemo). null = none deployed.
 */
export function useDemoSafe() {
  return useQuery({ queryKey: vaultKeys.demoSafe, queryFn: fetchDemoSafe, initialData: DEMO_SAFE ?? undefined, staleTime: Infinity });
}
