import { useSearchParams } from "react-router-dom";
import { Footer } from "@/shared/shell/Footer";
import { Header } from "@/shared/shell/Header";
import { isLive } from "@/shared/api/dataSource";
import { useDemoSafe, useVaultView } from "@/shared/api/useVaultView";
import { LiveVaultEvents, useVaultFeed } from "@/shared/api/vaultFeed";
import type { VaultView } from "@/shared/api/vaultSource";
import { cn } from "@/shared/lib/cn";
import { NetworkGuard } from "@/shared/ui/NetworkGuard";
import { Skeleton } from "@/shared/ui/Skeleton";
import { Breadcrumb } from "../layout/Breadcrumb";
import { VaultDashboard } from "../overview/VaultDashboard";
import { KillDock } from "../components/KillDock";
import { useOwnerControl } from "../hooks/useOwnerControl";
import { GuidedDemo } from "./GuidedDemo";

/** Phone Kill-Switch dock: anyone in the simulation, only the module owner's wallet on live data. */
function Dock({ view }: { view: VaultView }) {
  const feed = useVaultFeed(view);
  const control = useOwnerControl(view, { role: "anonymous", sandbox: true });
  return control.canSign && (control.isActive ?? feed.state?.isActive) ? <KillDock send={control.revoke} /> : null;
}

type Mode = "guided" | "free";
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "guided", label: "Guided", hint: "4 steps, about a minute" },
  { id: "free", label: "Free play", hint: "Every control, every attack" },
];

/** Guided (default) or Free play, kept in the URL (?mode=free) so a link opens the same view. */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div role="tablist" aria-label="Demo mode" className="inline-grid grid-cols-2 border border-line-strong bg-surface">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          onClick={() => onChange(m.id)}
          className={cn("min-h-11 border-r border-line-strong px-4 py-1.5 text-left last:border-r-0", mode === m.id ? "bg-ink text-bg" : "hover:bg-hover")}
        >
          <span className="block text-sm font-bold">{m.label}</span>
          <span className={cn("hidden font-mono text-[11px] sm:block", mode === m.id ? "opacity-80" : "text-muted")}>{m.hint}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * /demo: the public sandbox vault, no wallet and no sign-in. Guided walks a newcomer through four steps with the
 * result under each button; Free play is the full vault dashboard.
 */
export function DemoPage() {
  const demo = useDemoSafe();
  const demoSafe = demo.data ?? null;
  const { data: view, isPending, isError } = useVaultView(demoSafe);
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get("mode") === "free" ? "free" : "guided";
  const free = mode === "free";
  const setMode = (m: Mode) => {
    const next = new URLSearchParams(params);
    if (m === "guided") next.delete("mode");
    else next.set("mode", m);
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <NetworkGuard />
      <section className="blueprint border-b border-line">
        {/* Free play is for people who already know the idea: the hero shrinks so the moves sit on the first screen. */}
        <div className={cn("mx-auto max-w-6xl px-4 sm:px-6", free ? "pb-5 pt-4" : "pb-8 pt-6 sm:pt-8")}>
          <Breadcrumb items={[{ label: "Demo" }]} />
          <div className={cn("flex flex-wrap items-end justify-between", free ? "mt-2 gap-4" : "mt-4 gap-6")}>
            <div className="max-w-2xl">
              <span className="mono-label">Live sandbox · test money only</span>
              <h1
                data-ground="page-title"
                className={cn("mt-2 font-black uppercase italic leading-[0.92] tracking-[-0.04em]", free ? "text-3xl sm:text-4xl" : "text-4xl sm:text-6xl")}
              >
                Try to <span className="outline-text">break</span> it.
              </h1>
              {!free && (
                <p className="mt-3 text-base text-soft sm:text-lg">
                  An AI agent trades this vault around the clock. It can trade, but it can never take the money. See for yourself: no wallet needed.
                </p>
              )}
            </div>
            <ModeSwitch mode={mode} onChange={setMode} />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-28 pt-8 sm:px-6 lg:pb-10">
        {demo.isError ? (
          <p role="alert" className="border-l-4 border-danger bg-tint-pink px-3 py-2">The demo could not load. Refresh the page to try again.</p>
        ) : demo.isPending ? (
          <div className="space-y-6" aria-busy>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : !demoSafe ? (
          <p role="alert" className="border-l-4 border-warn bg-tint-amber px-3 py-2">
            The demo vault is not deployed yet. Please come back once it is.
          </p>
        ) : (
          <>
            {isPending && (
              <div className="space-y-6" aria-busy>
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-72 w-full" />
              </div>
            )}
            {isError && <p role="alert" className="border-l-4 border-danger bg-tint-pink px-3 py-2">The demo could not load. Refresh the page to try again.</p>}
            {view && (
              <>
                {isLive && <LiveVaultEvents safe={view.safe} />}
                {mode === "guided" ? (
                  <GuidedDemo view={view} onFreePlay={() => setMode("free")} />
                ) : (
                  <>
                    <VaultDashboard view={view} role="anonymous" mode="demo" />
                    <Dock view={view} />
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
