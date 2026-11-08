import { Navigate, useLocation } from "react-router-dom";
import { Footer } from "@/shared/shell/Footer";
import { Header } from "@/shared/shell/Header";
import { useSession } from "@/shared/session/sessionStore";
import { NetworkGuard } from "@/shared/ui/NetworkGuard";
import { Breadcrumb } from "../layout/Breadcrumb";
import { Placeholder } from "../pages/Placeholder";

/** /vaults: "my vaults". Needs a wallet; the card list is built in a later step (ui-pages.md §11). */
export function VaultListPage() {
  const wallet = useSession((s) => s.wallet);
  const location = useLocation();
  if (!wallet) return <Navigate to="/signin" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <NetworkGuard />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <Breadcrumb items={[{ label: "Vaults" }]} />
        <h1 className="text-3xl">My vaults</h1>
        <Placeholder code="VLT / LIST" title="Vault list" blurb="One card per vault: status, share of the daily budget used and the latest job; search by address and filter Protected / Revoked / Incomplete." />
      </main>
      <Footer />
    </div>
  );
}
