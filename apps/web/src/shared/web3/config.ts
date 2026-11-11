import { connectorsForWallets, type WalletList } from "@rainbow-me/rainbowkit";
import { coreWallet, injectedWallet, metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, fallback, http } from "wagmi";
import { avalancheFuji } from "wagmi/chains";

/** The only chain AgentShield runs on (D14: Fuji testnet). */
export const FUJI = avalancheFuji;

export const APP_NAME = "AgentShield";

type CreateWalletFn = WalletList[number]["wallets"][number];

const projectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "").trim();
const rpcUrl = (import.meta.env.VITE_FUJI_RPC_URL ?? "").trim();

/** True when a WalletConnect Cloud project id is configured (QR / mobile wallets become available). */
export const hasWalletConnect = projectId.length > 0;

/**
 * MetaMask and Core fall back to WalletConnect when their extension is not injected, and RainbowKit throws
 * on an empty projectId at config time. Probe each factory once and drop the ones that cannot be built,
 * so the app still boots with no env vars (injected wallets keep working).
 */
function buildable(wallets: CreateWalletFn[]): CreateWalletFn[] {
  return wallets.filter((createWallet) => {
    try {
      createWallet({ projectId, appName: APP_NAME });
      return true;
    } catch {
      return false;
    }
  });
}

const walletList: WalletList = [
  {
    groupName: "Recommended",
    wallets: buildable([coreWallet, metaMaskWallet, injectedWallet, ...(hasWalletConnect ? [walletConnectWallet] : [])]),
  },
];

const connectors = connectorsForWallets(walletList, { projectId, appName: APP_NAME });

/**
 * Read-only RPC for the browser. Owner actions (setPolicy, Kill-Switch) are signed in the wallet itself (P2);
 * this transport never carries a key. Custom RPC first, the chain's public RPC as fallback.
 */
export const wagmiConfig = createConfig({
  chains: [FUJI],
  connectors,
  transports: {
    [FUJI.id]: rpcUrl ? fallback([http(rpcUrl), http()]) : http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
