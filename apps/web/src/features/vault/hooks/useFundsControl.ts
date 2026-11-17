import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { Address, StateDto } from "@agentshield/shared";
import { isLive } from "@/shared/api/dataSource";
import { moveFundsTx, WALLET_BALANCES } from "@/shared/api/mockChain";
import { balanceOf, TOKENS, type TokenSymbol } from "@/shared/api/mockEngine";
import { queryKeys } from "@/shared/api/queryKeys";
import type { VaultView } from "@/shared/api/vaultSource";
import { faucetAvailableAt, fundsBlocker } from "@/shared/lib/funds";
import { policyTokensIn } from "@/shared/lib/policy";
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

/** Live: Safe owners and wallet balances read from Fuji; every move is a wallet-signed transaction. */
export function useLiveFundsControl(view: VaultView, state: StateDto | null): FundsControl {
  const qc = useQueryClient();
  const signer = useSigner();
  const addresses = useMemo(() => (state ? policyTokensIn(state) : null), [state]);
  const tokenList = useMemo(() => (addresses ? [addresses.usdc, addresses.wavax] : []), [addresses]);
  const read = useFundsChain(addresses ? view.safe : null, signer, tokenList);
  const { refetch } = read;

  const blocker = fundsBlocker(signer, read.owners, read.threshold);
  const canAct = read.status === "ready" && !!addresses && blocker === null;
  const notice = !addresses
    ? null
    : read.status === "unavailable"
      ? "Could not read this vault's owners from the chain. Check your connection and reload."
      : blocker;

  /** After a receipt: re-read the wallet and the vault (the server mirrors the chain, SSE does the same). */
  const settle = useCallback(
    (tx: SentTx): SentTx => ({
      hash: tx.hash,
      wait: async () => {
        await tx.wait();
        void qc.invalidateQueries({ queryKey: queryKeys.vaultState(view.safe) });
        void refetch();
      },
    }),
    [qc, view.safe, refetch],
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
          vault: state ? balanceOf(state, symbol) : 0n,
          wallet: t && signer ? t.wallet : null,
          faucetAmount: t ? t.faucetAmount : null,
          faucetAvailableAt: t ? faucetAvailableAt(t.lastFaucetAt, t.faucetCooldown, nowSec) : 0,
        };
      }),
      deposit: (symbol, amount) => async () => settle(await sendDeposit(addressOf(symbol), view.safe, amount)),
      withdraw: (symbol, amount) => async () => settle(await sendWithdraw(view.safe, addressOf(symbol), amount)),
      faucet: (symbol) => async () => settle(await sendFaucet(addressOf(symbol))),
    };
  }, [canAct, notice, read.tokens, addresses, state, signer, settle, view.safe]);
}

export const useFundsControl: (view: VaultView, state: StateDto | null, opts: { role: VaultRole }) => FundsControl = isLive
  ? (view, state) => useLiveFundsControl(view, state)
  : useMockFundsControl;
