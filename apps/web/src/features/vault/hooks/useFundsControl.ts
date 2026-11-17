import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { Address, StateDto } from "@agentshield/shared";
import { isLive } from "@/shared/api/dataSource";
import { moveFundsTx, WALLET_BALANCES } from "@/shared/api/mockChain";
import { balanceOf, TOKENS, type TokenSymbol } from "@/shared/api/mockEngine";
import { queryKeys } from "@/shared/api/queryKeys";
import type { VaultView } from "@/shared/api/vaultSource";
import { faucetAvailableAt, fundsBlocker } from "@/shared/lib/funds";
import { policyTokensIn, type PolicyTokens } from "@/shared/lib/policy";
import type { SentTx } from "@/shared/ui/TxButton";
import { sendDeposit, sendFaucet, sendWithdraw, useFundsChain } from "@/shared/web3/fundsChain";
import { useSigner } from "@/shared/web3/moduleChain";
import type { VaultRole } from "../guards/access";

/**
 * The owner's fund moves on a vault (L8): deposit from the wallet, withdraw back to it, and test tokens from the
 * faucet. Mock builds keep the in-browser simulation; live builds sign in the wallet and send straight to Fuji.
 */
export interface FundsToken {
  symbol: TokenSymbol;
  address: Address;
  decimals: number;
  /** In the vault, from the chain-sourced state. */
  vault: bigint;
  /** In the connected wallet; null while unknown. */
  wallet: bigint | null;
  /** One faucet drip, or null when this build has no faucet. */
  faucetAmount: bigint | null;
  /** Unix seconds when the next drip is allowed; 0 = now. */
  faucetAvailableAt: number;
}

export interface FundsControl {
  /** The connected wallet may move this vault's funds right now. */
  canAct: boolean;
  /** Why not, in English, for the owner who should be told. null = nothing to say (or still reading). */
  notice: string | null;
  tokens: FundsToken[];
  deposit: (symbol: TokenSymbol, amount: bigint) => () => Promise<SentTx>;
  withdraw: (symbol: TokenSymbol, amount: bigint) => () => Promise<SentTx>;
  faucet: (symbol: TokenSymbol) => () => Promise<SentTx>;
}

const SYMBOLS: TokenSymbol[] = ["USDC", "WAVAX"];

/** Simulation: the owner moves funds instantly against made-up wallet balances; no faucet. */
export function useMockFundsControl(view: VaultView, state: StateDto | null, { role }: { role: VaultRole }): FundsControl {
  return useMemo(
    () => ({
      canAct: role === "owner",
      notice: null,
      tokens: SYMBOLS.map((symbol) => ({
        symbol,
        address: TOKENS[symbol].address,
        decimals: TOKENS[symbol].decimals,
        vault: state ? balanceOf(state, symbol) : 0n,
        wallet: WALLET_BALANCES[symbol],
        faucetAmount: null,
        faucetAvailableAt: 0,
      })),
      deposit: (symbol, amount) => moveFundsTx(view.safe, "deposit", symbol, amount),
      withdraw: (symbol, amount) => moveFundsTx(view.safe, "withdraw", symbol, amount),
      faucet: () => () => Promise.reject(new Error("No faucet in the simulation.")),
    }),
    [view.safe, state, role],
  );
}

/**
 * Fund moves on any Safe straight against Fuji: owners and wallet balances read from the chain, every move signed in
 * the wallet. `vaultBalance` says what the Safe holds (from /state on the dashboard, from the chain in the wizard);
 * `onSettled` runs after each receipt so the caller can re-read it. null addresses = not known yet.
 */
export function useChainFundsControl(
  safe: Address,
  addresses: PolicyTokens | null,
  vaultBalance: (symbol: TokenSymbol) => bigint,
  onSettled: () => void,
): FundsControl {
  const signer = useSigner();
  const tokenList = useMemo(() => (addresses ? [addresses.usdc, addresses.wavax] : []), [addresses]);
  const read = useFundsChain(addresses ? safe : null, signer, tokenList);
  const { refetch } = read;

  const blocker = fundsBlocker(signer, read.owners, read.threshold);
  const canAct = read.status === "ready" && !!addresses && blocker === null;
  const notice = !addresses
    ? null
    : read.status === "unavailable"
      ? "Could not read this vault's owners from the chain. Check your connection and reload."
      : blocker;

  /** After a receipt: re-read the wallet and let the caller re-read the vault. */
  const settle = useCallback(
    (tx: SentTx): SentTx => ({
      hash: tx.hash,
      wait: async () => {
        await tx.wait();
        onSettled();
        void refetch();
      },
    }),
    [onSettled, refetch],
  );

  return useMemo<FundsControl>(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    const addressOf = (symbol: TokenSymbol): Address => {
      if (!addresses) throw new Error("The vault's token addresses are not known yet.");
      return symbol === "USDC" ? addresses.usdc : addresses.wavax;
    };
    return {
      canAct,
      notice,
      tokens: SYMBOLS.map((symbol, i) => {
        const t = read.tokens?.[i];
        return {
          symbol,
          address: addresses ? addressOf(symbol) : TOKENS[symbol].address,
          decimals: TOKENS[symbol].decimals,
          vault: vaultBalance(symbol),
          wallet: t && signer ? t.wallet : null,
          faucetAmount: t ? t.faucetAmount : null,
          faucetAvailableAt: t ? faucetAvailableAt(t.lastFaucetAt, t.faucetCooldown, nowSec) : 0,
        };
      }),
      deposit: (symbol, amount) => async () => settle(await sendDeposit(addressOf(symbol), safe, amount)),
      withdraw: (symbol, amount) => async () => settle(await sendWithdraw(safe, addressOf(symbol), amount)),
      faucet: (symbol) => async () => settle(await sendFaucet(addressOf(symbol))),
    };
  }, [canAct, notice, read.tokens, addresses, vaultBalance, signer, settle, safe]);
}

/** Live dashboard: token addresses and vault balances from the chain-sourced /state. */
export function useLiveFundsControl(view: VaultView, state: StateDto | null): FundsControl {
  const qc = useQueryClient();
  const addresses = useMemo(() => (state ? policyTokensIn(state) : null), [state]);
  const vaultBalance = useCallback((symbol: TokenSymbol) => (state ? balanceOf(state, symbol) : 0n), [state]);
  // The server mirrors the chain and SSE does the same; re-reading /state makes it show at once.
  const onSettled = useCallback(() => void qc.invalidateQueries({ queryKey: queryKeys.vaultState(view.safe) }), [qc, view.safe]);
  return useChainFundsControl(view.safe, addresses, vaultBalance, onSettled);
}

export const useFundsControl: (view: VaultView, state: StateDto | null, opts: { role: VaultRole }) => FundsControl = isLive
  ? (view, state) => useLiveFundsControl(view, state)
  : useMockFundsControl;
