import type { ReactNode } from "react";
import { Header } from "@/shared/shell/Header";
import { Footer } from "@/shared/shell/Footer";
import { NetworkGuard } from "@/shared/web3/NetworkGuard";
import { WalletButton } from "@/shared/web3/WalletButton";

interface AppShellProps {
  /** Mono breadcrumb in the app bar, e.g. "APP / DEMO VAULT". */
  label: string;
  /** Extra page controls in the app bar, left of the wallet (e.g. the /demo tour replay button). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Shell for the app routes (/demo, /vaults/*): the shared landing header, a sticky app bar
 * (sub-nav under the 56px header, z-30) with the wallet control, and the wrong-network banner.
 */
export function AppShell({ label, actions, children }: AppShellProps) {
  return (
    <div className="min-h-screen overflow-x-clip bg-bg text-fg">
      <Header />
      <div className="sticky top-14 z-30 border-b border-line bg-bg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="mono-label min-w-0 truncate">{label}</span>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <WalletButton />
          </div>
        </div>
      </div>
      <NetworkGuard />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
