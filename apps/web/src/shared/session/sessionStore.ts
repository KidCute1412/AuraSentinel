import { create } from "zustand";
import { AVALANCHE_FUJI_CHAIN_ID, type Address } from "@agentshield/shared";

export interface Wallet {
  address: Address;
  chainId: number;
}

interface SessionState {
  wallet: Wallet | null;
  connect: (address: Address, chainId?: number) => void;
  disconnect: () => void;
  setChainId: (chainId: number) => void;
}

const DEV_KEY = "agentshield.dev.wallet";

/** Dev only: keep the mock wallet across reloads so guards can be tested the way a real (auto-reconnecting) wallet behaves. */
function readDevWallet(): Wallet | null {
  if (!import.meta.env.DEV) return null;
  try {
    const raw = sessionStorage.getItem(DEV_KEY);
    return raw ? (JSON.parse(raw) as Wallet) : null;
  } catch {
    return null;
  }
}

/**
 * Connected-wallet snapshot shared by every page. Today it is fed by the access-gate mock and the
 * dev session bar; TODO(wagmi): mirror useAccount() into it so the rest of the app stays unchanged.
 */
export const useSession = create<SessionState>((set) => ({
  wallet: readDevWallet(),
  connect: (address, chainId = AVALANCHE_FUJI_CHAIN_ID) => set({ wallet: { address, chainId } }),
  disconnect: () => set({ wallet: null }),
  setChainId: (chainId) => set((s) => (s.wallet ? { wallet: { ...s.wallet, chainId } } : s)),
}));

export const isOnFuji = (w: Wallet | null): boolean => w?.chainId === AVALANCHE_FUJI_CHAIN_ID;

if (import.meta.env.DEV) {
  useSession.subscribe((state) => {
    try {
      if (state.wallet) sessionStorage.setItem(DEV_KEY, JSON.stringify(state.wallet));
      else sessionStorage.removeItem(DEV_KEY);
    } catch {
      // storage unavailable: the mock wallet just resets on reload
    }
  });
}
