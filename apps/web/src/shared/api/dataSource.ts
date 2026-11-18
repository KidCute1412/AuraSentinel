import { getAddress } from "viem";
import { Address } from "@agentshield/shared";

/**
 * Where the vault pages get their data, fixed at build time:
 * - "live" (default): the real API (VITE_API_URL) and SSE, real wallet sign-in. Needs the server running.
 * - "mock": the in-browser simulation in mockChain/mockEngine, no backend. Only with VITE_DATA_SOURCE=mock (tests,
 *   a preview deployed before the server): anything else is live, so a production build never serves the simulation.
 * Pages never mix the two: in live mode nothing simulated is shown.
 */
export type DataSource = "mock" | "live";

export const parseDataSource = (raw: string | undefined): DataSource => (raw?.trim().toLowerCase() === "mock" ? "mock" : "live");

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
