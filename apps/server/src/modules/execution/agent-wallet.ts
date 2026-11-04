import { createWalletClient, fallback, http, type Hex } from 'viem';
import { nonceManager, privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';

/**
 * The ONLY place the agent session key is turned into an account (invariant 5).
 * Not re-exported from execution.module; never the owner key.
 */
export function createAgentWallet(privateKey: Hex, rpcUrls: string[]) {
  const account = privateKeyToAccount(privateKey, { nonceManager });
  return createWalletClient({
    account,
    chain: avalancheFuji,
    transport: fallback(rpcUrls.map((url) => http(url, { timeout: 5_000 })), { rank: false }),
  });
}
