import { getAddress } from "viem";
import type { Address } from "@agentshield/shared";

export const shortAddress = (a: string, head = 6, tail = 4): string => `${a.slice(0, head)}…${a.slice(-tail)}`;

export const sameAddress = (a?: string | null, b?: string | null): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Route param -> checksummed address, or null when it is not a well-formed 20-byte hex address. */
export function parseAddressParam(param?: string): Address | null {
  if (!param || !/^0x[0-9a-fA-F]{40}$/.test(param)) return null;
  return getAddress(param.toLowerCase());
}
