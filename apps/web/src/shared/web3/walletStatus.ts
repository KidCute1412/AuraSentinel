import { getAddress, isAddress, type Address } from "viem";

export type WalletStatus = "disconnected" | "wrong-network" | "ready";

/** Pure view state for the connect control and the network guard. */
export function walletStatus(input: { isConnected: boolean; chainId: number | undefined; expectedChainId: number }): WalletStatus {
  if (!input.isConnected) return "disconnected";
  return input.chainId === input.expectedChainId ? "ready" : "wrong-network";
}

/** `0x1234…abcd` for chips; the full address stays in `title`/aria labels. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** Validates the `:safe` route param. Returns the checksummed address, or null when it is not an address. */
export function parseSafeParam(raw: string | undefined): Address | null {
  if (!raw || !isAddress(raw, { strict: false })) return null;
  return getAddress(raw);
}
