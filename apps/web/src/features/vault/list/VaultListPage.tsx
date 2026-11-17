import { Plus, Search } from "lucide-react";
import { useMemo } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { sameAddress } from "@/shared/lib/address";
import { cn } from "@/shared/lib/cn";
import { useSession } from "@/shared/session/sessionStore";
import { useWizardSafe } from "@/shared/session/wizardSafe";
import { Footer } from "@/shared/shell/Footer";
import { Header } from "@/shared/shell/Header";
import { primaryCta, secondaryCta } from "@/shared/ui/cta";
import { NetworkGuard } from "@/shared/ui/NetworkGuard";
import { Skeleton } from "@/shared/ui/Skeleton";
import { usePageMood } from "@/shared/mascot/usePageMood";
import { LINES } from "@/shared/mascot/lines";
import { Breadcrumb } from "../layout/Breadcrumb";
import { SetupCard, VaultCard } from "./VaultCard";
import { useMyVaultList, useVaultReads } from "./useMyVaults";
import { cardStatus, countByFilter, FILTER_LABEL, FILTERS, matchesFilter, matchesQuery, parseFilter, type Filter } from "./vaultList";

/** No vaults yet. Its own component so Aura-kun's mood hook mounts together with the element it watches. */
function EmptyVaults() {
  usePageMood("vaults-empty", "inspect", LINES.emptyList);
  return (
    <section id="vaults-empty" data-ground="vaults-empty" className="border border-line bg-surface p-8 text-center shadow-hard">
    <h2 className="text-xl">No vaults yet</h2>
    <p className="mx-auto mt-2 max-w-md text-soft">A vault is a Safe you own, guarded by limits the AI agent can never exceed. Setting one up takes a few minutes.</p>
    <div className="mt-6 flex flex-wrap justify-center gap-4">
      <span className="drop-hard"><Link to="/vaults/new" className={primaryCta}>Create vault</Link></span>
      <Link to="/demo" className={secondaryCta}>Try the demo</Link>
    </div>
  </section>
  );
}

/**
 * /vaults: the connected wallet's vaults (ui-pages.md §11). The registry says which vaults are theirs; each card's
 * status, budget and balances come from the chain-sourced state (P1). A vault still in the wizard is shown from the
 * chain too, even before the server knows it. Filters live in the URL so a view can be shared or reloaded.
 */
export function VaultListPage() {
  const wallet = useSession((s) => s.wallet);
  const location = useLocation();
  const setupSafe = useWizardSafe((s) => s.safe);
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get("status"));
  const query = params.get("q") ?? "";

  const list = useMyVaultList(wallet?.address ?? null);
  const views = useMemo(() => list.data ?? [], [list.data]);
  const reads = useVaultReads(views);
  const nowSec = Math.floor(Date.now() / 1000);

  if (!wallet) return <Navigate to="/signin" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;

  const rows = views.map((view) => {
    const read = reads[view.safe.toLowerCase()] ?? { state: null, load: "loading" as const };
    return { view, read, status: cardStatus(read.state, read.load, nowSec) };
  });
  const counts = countByFilter(rows.map((r) => r.status.status));
  const shown = rows.filter((r) => matchesFilter(r.status.status, filter) && matchesQuery([r.view.safe, r.view.module ?? ""], query));
  // The wizard's Safe gets its own card until the registry lists it (the server learns of it at the module step).
  const showSetup = !!setupSafe && !views.some((v) => sameAddress(v.safe, setupSafe)) && (filter === "all" || filter === "incomplete") && matchesQuery([setupSafe], query);
  const loaded = list.isSuccess;
  const nothingYet = loaded && views.length === 0 && !setupSafe;

  const setParam = (key: "status" | "q", value: string) => {
    const next = new URLSearchParams(params);
    if (value === "" || (key === "status" && value === "all")) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <NetworkGuard />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <Breadcrumb items={[{ label: "Vaults" }]} />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 data-ground="page-title" className="text-3xl">My vaults</h1>
            <p className="mt-1 text-sm text-muted">Vaults owned by the connected wallet. Status and balances are read from the chain.</p>
          </div>
          <span className="drop-hard">
            <Link to="/vaults/new" className={cn(primaryCta, "h-11 gap-2 px-5 text-sm")}>
              <Plus aria-hidden className="size-4" strokeWidth={3} /> Create vault
            </Link>
          </span>
        </div>

        {list.isError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-warn bg-tint-amber px-4 py-3 text-sm">
            <span>Could not load your vaults from the AgentShield server, so this list may be incomplete. Each vault page still works straight from the chain.</span>
            <button type="button" onClick={() => void list.refetch()} className="min-h-10 border border-line-strong bg-surface px-3 font-bold hover:bg-hover">
              Try again
            </button>
          </div>
        )}

        {nothingYet ? (
          <EmptyVaults />
        ) : (
          <>
            {views.length > 1 && (
              <div className="flex flex-wrap items-center gap-3">
                <div role="group" aria-label="Filter by status" data-ground="list-filters" className="flex flex-wrap border border-line-strong">
                  {FILTERS.map((f: Filter) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={filter === f}
                      onClick={() => setParam("status", f)}
                      className={cn("min-h-10 border-r border-line-strong px-3 text-xs font-bold last:border-r-0", filter === f ? "bg-ink text-bg" : "hover:bg-hover")}
                    >
                      {FILTER_LABEL[f]} <span className="tabular opacity-70">{counts[f]}</span>
                    </button>
                  ))}
                </div>
                <label className="relative min-w-56 flex-1 sm:max-w-xs">
                  <span className="sr-only">Search by address</span>
                  <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setParam("q", e.target.value)}
                    placeholder="Search by address"
                    autoComplete="off"
                    className="min-h-10 w-full border border-line-strong bg-surface pl-9 pr-3 font-mono text-sm placeholder:text-muted"
                  />
                </label>
              </div>
            )}

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {showSetup && <SetupCard wallet={wallet.address} />}
              {list.isPending && [0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full" />)}
              {shown.map((r) => (
                <VaultCard key={r.view.safe} view={r.view} read={r.read} status={r.status} />
              ))}
            </div>

            {loaded && views.length > 0 && shown.length === 0 && !showSetup && (
              <p role="status" className="text-sm text-soft">
                No vault matches.{" "}
                <button type="button" onClick={() => setParams(new URLSearchParams(), { replace: true })} className="font-bold text-accent-text underline underline-offset-4">
                  Clear filters
                </button>
              </p>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
