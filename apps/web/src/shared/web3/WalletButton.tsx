import { ConnectButton } from "@rainbow-me/rainbowkit";
import { TriangleAlert, Wallet } from "lucide-react";
import { cn } from "@/shared/lib/cn";

const base =
  "inline-flex h-10 items-center gap-2 rounded-none px-4 font-bold transition-transform duration-150 hover:-translate-x-px hover:-translate-y-px active:translate-x-0 active:translate-y-0";
const primary = cn(base, "bg-accent text-on-accent hover:shadow-hard-sm active:shadow-none");
const secondary = cn(base, "border border-line-strong bg-transparent text-fg hover:bg-hover");
const caution = cn(base, "border border-warn bg-transparent text-warn hover:bg-hover");

/**
 * Wallet control (RainbowKit, Core + MetaMask). Connecting only identifies the visitor's wallet;
 * nothing here signs or sends a transaction. Guests on /demo never need it (D12).
 */
export function WalletButton({ className }: { className?: string }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        if (!mounted) {
          return <span aria-hidden className={cn("block h-10 w-36 animate-pulse bg-hover", className)} />;
        }
        if (!account || !chain) {
          return (
            <button type="button" onClick={openConnectModal} className={cn(primary, className)}>
              <Wallet aria-hidden className="size-4" strokeWidth={2.5} />
              Kết nối ví
            </button>
          );
        }
        if (chain.unsupported) {
          return (
            <button type="button" onClick={openChainModal} className={cn(caution, className)}>
              <TriangleAlert aria-hidden className="size-4" strokeWidth={2.5} />
              Sai mạng
            </button>
          );
        }
        return (
          <div className={cn("flex items-center gap-2", className)}>
            <span className="hidden items-center gap-1.5 border border-line px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-widest text-accent-text sm:inline-flex">
              <span aria-hidden className="size-1.5 bg-ok" />
              Fuji
            </span>
            <button
              type="button"
              onClick={openAccountModal}
              title={account.address}
              aria-label={`Ví đã kết nối ${account.address}. Mở tuỳ chọn ví`}
              className={cn(secondary, "font-mono text-sm")}
            >
              {account.displayName}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
