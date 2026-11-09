import { useOutletContext } from "react-router-dom";
import type { Address } from "@agentshield/shared";
import type { VaultView } from "@/shared/api/vaultSource";
import type { VaultRole } from "../guards/access";

export interface VaultContext {
  safe: Address;
  view: VaultView;
  role: VaultRole;
}

/** Data every /vaults/:safe/* page needs, provided once by VaultLayout. */
export const useVaultContext = () => useOutletContext<VaultContext>();
