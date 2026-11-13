import { Link, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { Footer } from "@/shared/shell/Footer";
import { Header } from "@/shared/shell/Header";
import { isLive } from "@/shared/api/dataSource";
import { useVaultView } from "@/shared/api/useVaultView";
import { LiveVaultEvents, useVaultFeed } from "@/shared/api/vaultFeed";
import type { VaultView } from "@/shared/api/vaultSource";
import { parseAddressParam, shortAddress } from "@/shared/lib/address";
import { useSession } from "@/shared/session/sessionStore";
import { NetworkGuard } from "@/shared/ui/NetworkGuard";
import { Skeleton } from "@/shared/ui/Skeleton";
import { KillDock } from "../components/KillDock";
import { SECTION_LABEL, vaultRole, type VaultRole, type VaultSection } from "../guards/access";
import { Breadcrumb, type Crumb } from "./Breadcrumb";
import type { VaultContext } from "./context";
import { RouteNotice } from "./RouteNotice";
import { VaultHeader } from "./VaultHeader";
import { VaultNav } from "./VaultNav";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <NetworkGuard />
      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-28 pt-8 sm:px-6 lg:pb-10">{children}</main>
      <Footer />
    </div>
  );
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Frame>
      <Breadcrumb items={[{ label: "Vaults", to: "/vaults" }, { label: title }]} />
      <div className="border border-line bg-surface p-6 shadow-hard">
        <h1 className="text-2xl">{title}</h1>
        <div className="mt-3 space-y-4 text-soft">{children}</div>
      </div>
    </Frame>
  );
}

/** Phone-only Kill-Switch dock, shown to the owner while the vault is still active. Simulated data only for now. */
function OwnerDock({ view, role }: { view: VaultView; role: VaultRole }) {
  const feed = useVaultFeed(view);
  if (role !== "owner" || feed.source === "live" || feed.state?.isActive !== true) return null;
  return <KillDock safe={view.safe} />;
}

const sectionOf = (pathname: string, safe: string): VaultSection => {
  const rest = pathname.split(safe)[1]?.split("/").filter(Boolean)[0];
  return rest && rest in SECTION_LABEL ? (rest as VaultSection) : "overview";
};

/** Shell of every /vaults/:safe/* page: validates the address, loads the vault, derives the role, draws header + nav. */
export function VaultLayout() {
  const { safe: param } = useParams();
  const { pathname, search } = useLocation();
  const wallet = useSession((s) => s.wallet);
  const safe = parseAddressParam(param);
  const { data: view, isPending, isError, refetch } = useVaultView(safe);

  if (!safe) {
    return (
      <Problem title="Invalid vault address">
        <p>
          <code className="break-all bg-hover px-1.5 py-0.5 font-mono text-sm text-fg">{param}</code> is not a valid Safe address (expected <code className="font-mono text-fg">0x…</code> followed by 40 hex characters).
        </p>
        <Link to="/vaults" className="font-bold text-accent-text underline underline-offset-4">Back to your vaults</Link>
      </Problem>
    );
  }

  // Mixed or lower case in the URL -> canonical checksum form, keeping the sub-path and the query (activity filters).
  if (param !== safe) return <Navigate to={{ pathname: pathname.replace(param!, safe), search }} replace />;

  if (isPending) {
    return (
      <Frame>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-64 w-full" />
      </Frame>
    );
  }

  if (isError) {
    return (
      <Problem title="Could not load this vault">
        <p>Something went wrong while reading the vault. Your balances and policy are not affected; this is a display problem only.</p>
        <button type="button" onClick={() => void refetch()} className="min-h-10 border border-line-strong px-4 font-bold hover:bg-hover">Try again</button>
      </Problem>
    );
  }

  if (!view) {
    return (
      <Problem title="Vault not found">
        <p>
          No vault is registered at <span className="font-mono text-fg">{shortAddress(safe)}</span> yet. If you just created it, the indexer may need a few seconds to pick it up.
        </p>
        <div className="flex flex-wrap gap-4 font-bold">
          <Link to="/vaults/new" className="text-accent-text underline underline-offset-4">Create a vault</Link>
          <Link to="/demo" className="text-accent-text underline underline-offset-4">Try the demo vault</Link>
        </div>
      </Problem>
    );
  }

  const role = vaultRole(wallet?.address ?? null, view.owners);
  const section = sectionOf(pathname, safe);
  const crumbs: Crumb[] = [
    { label: "Vaults", to: "/vaults" },
    { label: shortAddress(safe), to: `/vaults/${safe}` },
    ...(section === "overview" ? [] : [{ label: SECTION_LABEL[section] }]),
  ];
  const context: VaultContext = { safe, view, role };

  return (
    <Frame>
      {isLive && <LiveVaultEvents safe={safe} />}
      <Breadcrumb items={crumbs} />
      <RouteNotice />
      <VaultHeader view={view} role={role} compactKill={section !== "overview"} />
      <VaultNav safe={safe} role={role} />
      <Outlet context={context} />
      <OwnerDock view={view} role={role} />
    </Frame>
  );
}
