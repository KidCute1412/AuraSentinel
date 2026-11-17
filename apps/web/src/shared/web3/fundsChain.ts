import { useMemo } from "react";
import { erc20Abi, zeroAddress, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { simulateContract } from "wagmi/actions";
import { faucetAbi, safeAbi, withdrawArgs } from "@/shared/lib/funds";
import type { SentTx } from "@/shared/ui/TxButton";
import { FUJI, wagmiConfig } from "./config";
import { sendSimulated } from "./moduleChain";

/**
 * The owner's fund moves on Fuji (L8), straight from the wallet to the chain like the Kill-Switch (P2): nothing goes
 * through our server. Reads are polled so balances follow the chain after each move.
 */

const POLL_MS = 6_000;

export interface FundsChainRead {
  /** Safe.getOwners() / getThreshold(); null while loading. */
  owners: readonly Address[] | null;
  threshold: bigint | null;
  /** Per token, in the order given: what the connected wallet holds, and its faucet state. */
  tokens: { wallet: bigint; faucetAmount: bigint; faucetCooldown: bigint; lastFaucetAt: bigint }[] | null;
  status: "loading" | "ready" | "unavailable";
  refetch: () => Promise<unknown>;
}

export function useFundsChain(safe: Address | null, wallet: Address | null, tokens: readonly Address[]): FundsChainRead {
  const holder = wallet ?? zeroAddress;
  // Two Safe reads, then four per token; the result is unpacked by position below.
  const contracts = [
    { chainId: FUJI.id, address: safe ?? zeroAddress, abi: safeAbi, functionName: "getOwners" },
    { chainId: FUJI.id, address: safe ?? zeroAddress, abi: safeAbi, functionName: "getThreshold" },
    ...tokens.flatMap((token) => [
      { chainId: FUJI.id, address: token, abi: erc20Abi, functionName: "balanceOf", args: [holder] },
      { chainId: FUJI.id, address: token, abi: faucetAbi, functionName: "faucetAmount" },
      { chainId: FUJI.id, address: token, abi: faucetAbi, functionName: "faucetCooldown" },
      { chainId: FUJI.id, address: token, abi: faucetAbi, functionName: "lastFaucetAt", args: [holder] },
    ]),
  ];
  const q = useReadContracts({
    allowFailure: false,
    contracts,
    query: { enabled: !!safe && tokens.length > 0, refetchInterval: POLL_MS, retry: 2 },
  } as never) as { data?: unknown; isError: boolean; refetch: () => Promise<unknown> };
  const data = useMemo(() => {
    if (!q.data) return null;
    const [owners, threshold, ...rest] = q.data as unknown as [readonly Address[], bigint, ...bigint[]];
    const perToken = tokens.map((_, i) => ({
      wallet: wallet ? (rest[i * 4] ?? 0n) : 0n,
      faucetAmount: rest[i * 4 + 1] ?? 0n,
      faucetCooldown: rest[i * 4 + 2] ?? 0n,
      lastFaucetAt: wallet ? (rest[i * 4 + 3] ?? 0n) : 0n,
    }));
    return { owners, threshold, tokens: perToken };
  }, [q.data, tokens, wallet]);
  return {
    owners: data?.owners ?? null,
    threshold: data?.threshold ?? null,
    tokens: data?.tokens ?? null,
    status: data ? "ready" : q.isError ? "unavailable" : "loading",
    refetch: q.refetch,
  };
}

/** Owner's wallet -> Safe: a plain ERC-20 transfer. */
export const sendDeposit = (token: Address, safe: Address, amount: bigint): Promise<SentTx> =>
  sendSimulated((account) => simulateContract(wagmiConfig, { chainId: FUJI.id, account, address: token, abi: erc20Abi, functionName: "transfer", args: [safe, amount] }));

/** Test tokens for the connected wallet (MockUSDC / MockWAVAX faucet, one drip per cooldown). */
export const sendFaucet = (token: Address): Promise<SentTx> =>
  sendSimulated((account) => simulateContract(wagmiConfig, { chainId: FUJI.id, account, address: token, abi: faucetAbi, functionName: "faucet" }));

/**
 * Safe -> owner's wallet, as a Safe transaction the owner sends with an approved-hash signature (1-of-1 Safe).
 * The recipient is always the sending owner: there is no field for another address.
 */
export const sendWithdraw = (safe: Address, token: Address, amount: bigint): Promise<SentTx> =>
  sendSimulated((account) =>
    simulateContract(wagmiConfig, { chainId: FUJI.id, account, address: safe, abi: safeAbi, functionName: "execTransaction", args: withdrawArgs(token, account, amount) }),
  );
