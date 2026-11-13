import { getAddress } from "viem";
import { Address } from "@agentshield/shared";

/**
 * Where the vault pages get their data, fixed at build time:
 * - "mock" (default): the in-browser simulation in mockChain/mockEngine. No backend needed.
 * - "live": the real API (VITE_API_URL) and SSE. Set VITE_DATA_SOURCE=live.
 * Pages never mix the two: in live mode nothing simulated is shown.
 */
export type DataSource = "mock" | "live";

export const parseDataSource = (raw: string | undefined): DataSource => (raw?.trim().toLowerCase() === "live" ? "live" : "mock");

/**
 * A valid address in checksum form, or null for anything else (empty, typo, wrong length). Lower-cased first so a
 * badly checksummed value is normalized instead of throwing while the app loads.
 */
export function parseAddressEnv(raw: string | undefined): Address | null {
  const value = raw?.trim();
  return Address.safeParse(value).success ? getAddress((value as Address).toLowerCase()) : null;
}

export const DATA_SOURCE: DataSource = parseDataSource(import.meta.env.VITE_DATA_SOURCE);
export const isLive = DATA_SOURCE === "live";

/**
 * Live mode, optional: the public demo Safe (SAFE_ADDRESS on the server). When unset, /demo asks GET /vaults which
 * registered vault is the demo one.
 */
export const LIVE_DEMO_SAFE: Address | null = parseAddressEnv(import.meta.env.VITE_DEMO_SAFE);
