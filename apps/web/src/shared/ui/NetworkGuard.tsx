import { TriangleAlert } from "lucide-react";
import { AVALANCHE_FUJI_CHAIN_ID } from "@agentshield/shared";
import { isOnFuji, useSession } from "@/shared/session/sessionStore";

/** Banner shown when the connected wallet is on the wrong chain. Renders nothing otherwise. */
export function NetworkGuard() {
  const wallet = useSession((s) => s.wallet);
  const setChainId = useSession((s) => s.setChainId);
  if (!wallet || isOnFuji(wallet)) return null;

  // TODO(wagmi): replace with useSwitchChain().switchChain({ chainId: AVALANCHE_FUJI_CHAIN_ID }).
  const switchChain = () => setChainId(AVALANCHE_FUJI_CHAIN_ID);

  return (
    <div role="alert" className="border-b-2 border-on-accent bg-highlight text-on-accent">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm font-bold sm:px-6">
        <span className="inline-flex items-center gap-2">
          <TriangleAlert aria-hidden className="size-4" />
          Your wallet is on the wrong network. AgentShield runs on Avalanche Fuji.
        </span>
        <button
          type="button"
          onClick={switchChain}
          className="min-h-9 border-2 border-on-accent bg-on-accent px-3 font-mono text-xs font-bold uppercase tracking-widest text-highlight hover:bg-transparent hover:text-on-accent"
        >
          Switch to Fuji
        </button>
      </div>
    </div>
  );
}
