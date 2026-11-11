import { TriangleAlert } from "lucide-react";
import { useAccount, useSwitchChain } from "wagmi";
import { FUJI } from "./config";
import { walletStatus } from "./walletStatus";

/** Banner shown only when a connected wallet sits on another chain (ui-pages §2 "Network guard"). */
export function NetworkGuard() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending, error, reset } = useSwitchChain();

  if (walletStatus({ isConnected, chainId, expectedChainId: FUJI.id }) !== "wrong-network") return null;

  return (
    <div role="region" aria-label="Network warning" className="border-b border-on-accent bg-highlight text-on-accent">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="flex min-w-0 items-start gap-2 font-bold">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
          <span>
            Your wallet is on the wrong network <span className="font-mono text-sm">(chain {chainId ?? "?"})</span>. AgentShield only
            runs on Avalanche Fuji.
          </span>
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            reset();
            switchChain({ chainId: FUJI.id });
          }}
          className="inline-flex h-10 items-center rounded-none border border-on-accent px-4 font-bold hover:bg-on-accent hover:text-highlight disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Switching…" : "Switch to Avalanche Fuji"}
        </button>
        {error && (
          <p role="alert" className="w-full text-sm font-bold">
            The wallet did not switch. Open your wallet, pick Avalanche Fuji (chain {FUJI.id}) and try again.
          </p>
        )}
      </div>
    </div>
  );
}
