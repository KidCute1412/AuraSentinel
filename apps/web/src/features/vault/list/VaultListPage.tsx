import { Link, Navigate, useLocation } from "react-router-dom";
import { Footer } from "@/shared/shell/Footer";
import { Header } from "@/shared/shell/Header";
import { shortAddress } from "@/shared/lib/address";
import { useSession } from "@/shared/session/sessionStore";
import { useWizardSafe } from "@/shared/session/wizardSafe";
import { NetworkGuard } from "@/shared/ui/NetworkGuard";
import { Breadcrumb } from "../layout/Breadcrumb";
import { Placeholder } from "../pages/Placeholder";

/** /vaults: "my vaults". Needs a wallet; the card list is built in a later step (ui-pages.md §11). */
export function VaultListPage() {
  const wallet = useSession((s) => s.wallet);
  const location = useLocation();
  const setupSafe = useWizardSafe((s) => s.safe);
  if (!wallet) return <Navigate to="/signin" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <NetworkGuard />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <Breadcrumb items={[{ label: "Vaults" }]} />
        <h1 className="text-3xl">My vaults</h1>
        {setupSafe && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-accent bg-surface px-4 py-3 shadow-hard-sm">
            <span className="text-sm">
              You have a vault in setup: <span className="font-mono">{shortAddress(setupSafe)}</span>. Your progress is read from the chain.
            </span>
            <Link to="/vaults/new" className="min-h-10 bg-accent px-4 py-2 text-sm font-bold text-on-accent">
              Continue setup
            </Link>
          </div>
        )}
        <Placeholder code="VLT / LIST" title="Vault list" blurb="One card per vault: status, share of the daily budget used and the latest job; search by address and filter Protected / Revoked / Incomplete." />
      </main>
      <Footer />
    </div>
  );
}
