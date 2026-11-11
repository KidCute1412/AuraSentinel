import "@rainbow-me/rainbowkit/styles.css";
import type { ReactNode } from "react";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { APP_NAME, FUJI, wagmiConfig } from "./config";
import { sentinelTheme } from "./rainbowTheme";

interface Web3ProviderProps {
  queryClient: QueryClient;
  children: ReactNode;
}

/** Order required by wagmi v2 + RainbowKit: WagmiProvider > QueryClientProvider > RainbowKitProvider. */
export function Web3Provider({ queryClient, children }: Web3ProviderProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={sentinelTheme} locale="en-US" initialChain={FUJI} appInfo={{ appName: APP_NAME }} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
