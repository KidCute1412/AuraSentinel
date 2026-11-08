import { useQuery } from "@tanstack/react-query";
import type { Address } from "@agentshield/shared";
import { fetchVaultView } from "./vaultSource";

/** Query key convention from ui-pages.md §8: ["vault", safe, ...]. */
export const vaultKeys = { view: (safe: string) => ["vault", safe.toLowerCase(), "view"] as const };

export function useVaultView(safe: Address | null) {
  return useQuery({
    queryKey: vaultKeys.view(safe ?? "none"),
    queryFn: () => fetchVaultView(safe!),
    enabled: !!safe,
  });
}
