import { Footer } from "@/shared/shell/Footer";
import { Header } from "@/shared/shell/Header";
import { useVaultSim } from "@/shared/api/mockChain";
import { useVaultView } from "@/shared/api/useVaultView";
import { DEMO_SAFE, type VaultView } from "@/shared/api/vaultSource";
import { NetworkGuard } from "@/shared/ui/NetworkGuard";
import { Skeleton } from "@/shared/ui/Skeleton";
import { Breadcrumb } from "../layout/Breadcrumb";
import { VaultHeader } from "../layout/VaultHeader";
import { VaultDashboard } from "../overview/VaultDashboard";
import { KillDock } from "../components/KillDock";

function Dock({ view }: { view: VaultView }) {
  const sim = useVaultSim(view);
  return sim?.state.isActive ? <KillDock safe={view.safe} /> : null;
}

/** /demo: the public sandbox vault. No wallet, no sign-in. Same dashboard as a real vault, with a guided tour. */
export function DemoPage() {
  const { data: view, isPending, isError } = useVaultView(DEMO_SAFE);
  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <NetworkGuard />
      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-28 pt-8 sm:px-6 lg:pb-10">
        <Breadcrumb items={[{ label: "Demo" }]} />
        <div>
          <h1 className="text-3xl">Try AgentShield</h1>
          <p className="mt-1 max-w-2xl text-soft">
            This is a live sandbox vault. Make the agent trade, then try to break it. Nothing here is real money.
          </p>
        </div>
        {isPending && (
          <div className="space-y-6" aria-busy>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        )}
        {isError && <p role="alert" className="border-l-4 border-danger bg-tint-pink px-3 py-2">The demo could not load. Refresh the page to try again.</p>}
        {view && (
          <>
            <VaultHeader view={view} role="anonymous" sandbox />
            <VaultDashboard view={view} role="anonymous" mode="demo" />
            <Dock view={view} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
