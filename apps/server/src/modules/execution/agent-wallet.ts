import { createWalletClient, fallback, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';

/**
 * The ONLY place the agent session key is turned into an account (invariant 5).
 * Not re-exported from execution.module; never the owner key. Nonces are assigned by
 * ViemTxSender under its mutex (not by viem's nonceManager) so a signed transaction can be
 * re-broadcast byte for byte when an RPC times out.
 */
export function createAgentWallet(privateKey: Hex, rpcUrls: string[]) {
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: avalancheFuji,
    transport: fallback(rpcUrls.map((url) => http(url, { timeout: 10_000 })), { rank: false }),
  });
}

export type AgentWallet = ReturnType<typeof createAgentWallet>;
