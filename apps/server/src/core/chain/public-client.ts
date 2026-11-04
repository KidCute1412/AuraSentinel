import { createPublicClient, fallback, http, PublicClient } from 'viem';
import { avalancheFuji } from 'viem/chains';

/** Read-only client with RPC fallback. Holds no key (invariant 5). */
export function createFujiPublicClient(rpcUrls: string[]): PublicClient {
  return createPublicClient({
    chain: avalancheFuji,
    transport: fallback(rpcUrls.map((url) => http(url, { timeout: 5_000 })), { rank: false }),
  });
}
