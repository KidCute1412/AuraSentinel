import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, KeyRound, Pause, Play, RefreshCw, TriangleAlert, XOctagon, Zap } from "lucide-react";
import { fromAmount, type CheckStatus, type PreflightCheck, type RebalancerStatusDto } from "@agentshield/shared";
import {
  ADMIN_JOBS_PAGE,
  API_BASE,
  API_V1,
  ApiError,
  useAdminJobs,
  useAdminOverview,
  usePreflight,
  useRebalancerStatus,
  useRunTick,
  useSession as useServerSession,
  useSetRebalancerPaused,
  type AdminJobFilter,
} from "@/shared/api";
import { isLive } from "@/shared/api/dataSource";
import { cn } from "@/shared/lib/cn";
import { formatTokenAmount } from "@/shared/lib/format";
import { groundId } from "@/shared/lib/ground";
import { timeAgo } from "@/shared/lib/time";
import { Footer } from "@/shared/shell/Footer";
import { Header } from "@/shared/shell/Header";
import { AddressChip } from "@/shared/ui/AddressChip";
import { Chamfer } from "@/shared/ui/Chamfer";
import { primaryCta } from "@/shared/ui/cta";
import { Reveal } from "@/shared/ui/Reveal";
import { Skeleton } from "@/shared/ui/Skeleton";
import { SnowtraceLink } from "@/shared/ui/SnowtraceLink";
import { Stamp } from "@/shared/ui/Stamp";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { compactCount, jobTitle, seconds, skipReason, VERDICT } from "./labels";

const UNKNOWN = "—";
const secondaryBtn =
  "inline-flex min-h-10 items-center justify-center gap-2 border border-line-strong px-4 font-bold hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40";

/** A lost admin role (cookie expired, wallet taken off the list) is not an outage: say which one it is. */
function errorText(error: Error, what: string): string {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return "Your session is not an admin any more. Sign in again.";
  return `${what}: ${error.message}`;
}

// ---------- Layout pieces (the /proof page's grammar) ----------

function Section({ index, label, title, intro, children }: { index: string; label: string; title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <span className="mono-label">
            {index} · {label}
          </span>
          <h2 className="mt-2 text-3xl md:text-4xl">{title}</h2>
          <div className="mt-4 text-soft">{intro}</div>
        </div>
        <Reveal className="min-w-0 space-y-6 lg:col-span-8">{children}</Reveal>
      </div>
    </section>
  );
}

const TILE_TONE = {
  ok: { edge: "bg-accent", fill: "bg-tint-mint" },
  warn: { edge: "bg-warn", fill: "bg-tint-amber" },
  danger: { edge: "bg-danger", fill: "bg-tint-pink" },
  neutral: { edge: "bg-line-strong", fill: "bg-surface" },
} as const;

function Tile({ label, value, note, tone = "neutral", size = "lg" }: { label: string; value: string; note: string; tone?: keyof typeof TILE_TONE; size?: "lg" | "sm" }) {
  return (
    <Chamfer tilt ground={groundId("admin-tile", label)} edge={TILE_TONE[tone].edge} fill={TILE_TONE[tone].fill} innerClassName="p-5">
      <dt className="mono-label">{label}</dt>
      <dd className={cn("tabular mt-2 font-bold", size === "lg" ? "text-4xl sm:text-5xl" : "text-3xl")}>{value}</dd>
      <p className="mt-2 text-sm text-soft">{note}</p>
    </Chamfer>
  );
}

/** Square block badge (design-system §3): text and icon, never color alone. */
const CHECK_BADGE: Record<CheckStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  ok: { label: "OK", icon: CheckCircle2, className: "bg-accent text-on-accent" },
  warn: { label: "Warn", icon: TriangleAlert, className: "bg-warn text-bg" },
  fail: { label: "Fail", icon: XOctagon, className: "bg-danger text-white" },
};

function CheckBadge({ status }: { status: CheckStatus }) {
  const b = CHECK_BADGE[status];
  const Icon = b.icon;
  return (
    <span className={cn("inline-flex w-16 shrink-0 items-center justify-center gap-1 py-1 font-mono text-[11px] font-bold uppercase tracking-widest", b.className)}>
      <Icon aria-hidden strokeWidth={3} className="size-3" />
      {b.label}
    </span>
  );
}

// ---------- Access ----------

function Gate({ code, edge = "bg-line-strong", stamp, title, children }: { code: string; edge?: string; stamp?: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="blueprint border-b border-line">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <Chamfer edge={edge} code={code} ground="admin-gate" className="mx-auto max-w-2xl" innerClassName="p-6 pb-10 sm:p-10 sm:pb-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="mono-label">OPS CONSOLE / Admin only</span>
            {stamp}
          </div>
          <h1 data-ground="page-title" className="mt-6 text-3xl font-black sm:text-4xl">
            {title}
          </h1>
          <div className="mt-3 space-y-4 text-soft">{children}</div>
        </Chamfer>
      </div>
    </section>
  );
}

function Access({ live }: { live: boolean }) {
  const session = useServerSession({ enabled: live });
  if (!live) {
    return (
      <Gate code="OFFLINE" title="Needs the live server" stamp={<Stamp tone="warn">Simulation</Stamp>}>
        <p>This build runs the in-browser simulation, which has no server to operate. The console works on a live build (VITE_DATA_SOURCE=live).</p>
      </Gate>
    );
  }
  if (session.isPending) return <Gate code="ACCESS" title="Checking your session"><Skeleton className="h-10 w-48" /></Gate>;
  if (session.isError) {
    return (
      <Gate code="ACCESS" title="The server did not answer" stamp={<Stamp tone="warn">Offline</Stamp>}>
        <p>Could not read your session: {session.error.message}. Check that the API is running, then reload.</p>
      </Gate>
    );
  }
  const s = session.data;
  if (!s.address) {
    return (
      <Gate code="ACCESS" title="Sign in with an admin wallet">
        <p>The console is for the people running the demo. Sign in with a wallet listed in the server&apos;s ADMIN_ADDRESSES.</p>
        <span className="drop-hard inline-block">
          <Link to="/signin" className={primaryCta}>
            <KeyRound aria-hidden className="mr-2 size-4" />
            Sign in
          </Link>
        </span>
      </Gate>
    );
  }
  if (s.role !== "admin") {
    return (
      <Gate code="ACCESS DENIED" edge="bg-danger" title="This wallet is not an admin" stamp={<Stamp tone="danger">Denied</Stamp>}>
        <p>
          You are signed in as <AddressChip address={s.address} />, which is not in the server&apos;s ADMIN_ADDRESSES. Add it there, restart the API,
          then reload this page.
        </p>
        <p>
          <Link to="/demo" className="font-bold text-accent-text hover:underline">
            Back to the demo
          </Link>
        </p>
      </Gate>
    );
  }
  return <Console />;
}

// ---------- The console ----------

function Console() {
  const preflight = usePreflight(true);
  const rebalancer = useRebalancerStatus(true);
  const p = preflight.data;
  const r = rebalancer.data;
  const verdict = p ? VERDICT[p.status] : null;

  return (
    <>
      <section className="blueprint relative overflow-hidden border-b border-line">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-16 sm:px-6 lg:pt-24">
          <div className="flex flex-wrap items-center gap-3">
            <span className="mono-label">OPS CONSOLE / Avalanche Fuji · chain 43113</span>
            {verdict && (
              <Stamp tone={verdict.tone} animate>
                {verdict.label}
              </Stamp>
            )}
          </div>
          <h1 data-ground="page-title" className="mt-4 text-5xl font-black italic uppercase leading-[0.92] tracking-[-0.04em] sm:text-7xl">
            Is the stage
            <span className="outline-text block">ready?</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-soft">
            Every check below is read from the chain and the services, then judged by fixed rules. Nothing here can move funds or change a
            policy: those stay with the vault owner&apos;s wallet.
          </p>
          <dl className="mt-10 grid gap-5 md:grid-cols-3">
            <Tile
              label="Agent gas"
              value={r ? (r.agent.swapsLeft === null ? UNKNOWN : `≈ ${compactCount(r.agent.swapsLeft)}`) : UNKNOWN}
              note={r ? `swaps left · ${formatTokenAmount(BigInt(r.agent.avaxBalance), 18, 4)} AVAX` : rebalancer.isError ? errorText(rebalancer.error, "Could not load") : "loading"}
              tone={!r ? "neutral" : r.agent.lowGas ? "danger" : "ok"}
            />
            <Tile
              label="Demo budget left"
              value={p?.demoBudget ? formatTokenAmount(fromAmount(p.demoBudget.left), 6) : UNKNOWN}
              note={p?.demoBudget ? `of ${formatTokenAmount(fromAmount(p.demoBudget.cap), 6)} USDC today` : p ? "demo vault not readable" : "loading"}
              tone={!p?.demoBudget ? "neutral" : statusTone(p.checks.find((c) => c.id === "demo-budget")?.status)}
            />
            <Tile
              label="Rebalancer"
              value={r ? (r.paused ? "Paused" : "Running") : UNKNOWN}
              note={r ? `${r.paused ? "Demo mode on" : `every ${Math.round(r.intervalMs / 1000)} s`} · last run ${r.lastTickAt ? timeAgo(r.lastTickAt) : "never"}` : "loading"}
              tone={!r ? "neutral" : r.paused ? "ok" : "warn"}
            />
          </dl>
        </div>
      </section>

      <Section
        index="01"
        label="Preflight"
        title="Ready for the stage?"
        intro="Run it before you present. Anything yellow or red says what to do about it. It refreshes every 15 seconds."
      >
        <PreflightList query={preflight} />
      </Section>

      <Section
        index="02"
        label="Rebalancer"
        title="Quiet when you present."
        intro="The rebalancer trades every enabled vault on its own. Demo mode pauses it, so the only trades on stage are the ones you press. Buttons on /demo keep working."
      >
        <RebalancerControls status={r} error={rebalancer.isError ? rebalancer.error : null} />
      </Section>

      <Section index="03" label="Activity" title="What happened, everywhere." intro="Jobs from every vault, the work waiting in each queue, and the vaults the agent knows about.">
        <Activity />
      </Section>

      <Section index="04" label="Tools" title="Under the hood." intro="For debugging. Bull Board can retry or delete queue jobs: use it with care.">
        <Chamfer code="TOOLS" innerClassName="p-0 pb-6">
          <ul className="divide-y divide-line">
            {[
              { href: `${API_V1}/admin/queues`, label: "Bull Board", note: "Queue internals: retry, delete, inspect" },
              { href: `${API_BASE}/health`, label: "Health check", note: "Postgres, Redis, RPC and worker, as JSON" },
            ].map((t) => (
              <li key={t.label}>
                <a href={t.href} target="_blank" rel="noreferrer" className="flex min-h-14 items-center justify-between gap-3 px-5 py-3 hover:bg-hover">
                  <span>
                    <span className="block font-bold">{t.label}</span>
                    <span className="block text-sm text-soft">{t.note}</span>
                  </span>
                  <ArrowUpRight aria-hidden className="size-5 shrink-0 text-accent-text" />
                </a>
              </li>
            ))}
          </ul>
        </Chamfer>
      </Section>
    </>
  );
}

const statusTone = (s: CheckStatus | undefined): keyof typeof TILE_TONE => (s === "ok" ? "ok" : s === "warn" ? "warn" : s === "fail" ? "danger" : "neutral");

function PreflightList({ query }: { query: ReturnType<typeof usePreflight> }) {
  const p = query.data;
  if (!p) {
    return query.isError ? (
      <Chamfer code="PREFLIGHT" edge="bg-danger" innerClassName="p-5 pb-10">
        <p role="alert" className="text-soft">
          {errorText(query.error, "Could not run the checks")}
        </p>
      </Chamfer>
    ) : (
      <Skeleton className="h-96 w-full" />
    );
  }
  const counts = (["fail", "warn", "ok"] as const).map((s) => [s, p.checks.filter((c) => c.status === s).length] as const);
  return (
    <Chamfer code="PREFLIGHT" edge={TILE_TONE[statusTone(p.status)].edge} innerClassName="p-0 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <p className="font-mono text-xs uppercase tracking-widest text-soft">
          {counts.map(([s, n]) => `${n} ${CHECK_BADGE[s].label}`).join(" · ")} · checked {timeAgo(p.checkedAt)}
        </p>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className={secondaryBtn}>
          <RefreshCw aria-hidden className={cn("size-4", query.isFetching && "opacity-40")} />
          {query.isFetching ? "Checking…" : "Run checks again"}
        </button>
      </div>
      <ul className="divide-y divide-line">
        {p.checks.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </ul>
    </Chamfer>
  );
}

function CheckRow({ check }: { check: PreflightCheck }) {
  return (
    <li data-ground={groundId("check", check.id)} className="flex gap-4 px-5 py-4">
      <CheckBadge status={check.status} />
      <div className="min-w-0">
        <p className="font-bold">{check.label}</p>
        <p className="mt-1 break-words font-mono text-sm text-soft">{check.detail}</p>
        {check.fix && (
          <p className="mt-2 flex gap-2 text-sm">
            <span className="mono-label shrink-0 pt-0.5">Fix</span>
            <span>{check.fix}</span>
          </p>
        )}
      </div>
    </li>
  );
}

// ---------- Rebalancer ----------

function RebalancerControls({ status, error }: { status: RebalancerStatusDto | undefined; error: Error | null }) {
  const toggle = useSetRebalancerPaused();
  const tick = useRunTick();
  if (!status) {
    return error ? (
      <Chamfer code="REBALANCER" edge="bg-danger" innerClassName="p-5 pb-10">
        <p role="alert" className="text-soft">
          {errorText(error, "Could not load the rebalancer")}
        </p>
      </Chamfer>
    ) : (
      <Skeleton className="h-72 w-full" />
    );
  }
  const modes = [
    { paused: false, label: "Running", icon: Play },
    { paused: true, label: "Demo mode", icon: Pause },
  ];
  const last = status.lastTick;
  return (
    <>
      <Chamfer code="REBALANCER" innerClassName="p-5 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div role="group" aria-label="Rebalancer mode" className="grid grid-cols-2 border border-line-strong">
            {modes.map((m) => {
              const on = status.paused === m.paused;
              const Icon = m.icon;
              return (
                <button
                  key={m.label}
                  type="button"
                  aria-pressed={on}
                  disabled={toggle.isPending}
                  onClick={() => !on && toggle.mutate(m.paused)}
                  className={cn(
                    "inline-flex min-h-11 items-center justify-center gap-2 px-4 font-bold disabled:cursor-not-allowed",
                    on ? "bg-ink text-bg" : "text-soft hover:bg-hover hover:text-fg",
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                  {m.label}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => tick.mutate()} disabled={status.paused || tick.isPending} className={secondaryBtn}>
            <Zap aria-hidden className="size-4" />
            {tick.isPending ? "Queuing…" : "Run one tick now"}
          </button>
        </div>
        <p className="mt-4 text-sm text-soft">
          {status.paused
            ? "Paused: the agent makes no trades on its own. Resume to run a tick by hand."
            : `Running every ${Math.round(status.intervalMs / 1000)} s. Pause it before you present.`}
        </p>
        {toggle.isError && (
          <p role="alert" className="mt-2 text-sm text-danger-text">
            {errorText(toggle.error, "Could not change it")}
          </p>
        )}
        {tick.isError && (
          <p role="alert" className="mt-2 text-sm text-danger-text">
            {errorText(tick.error, "Could not queue a tick")}
          </p>
        )}
        {tick.isSuccess && <p className="mt-2 font-mono text-xs uppercase tracking-widest text-accent-text">Tick queued · results in a few seconds</p>}
        <dl className="mt-6 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <div>
            <dt className="mono-label">Agent</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {status.agent.address === "0x0000000000000000000000000000000000000000" ? (
                <span className="text-sm text-soft">Unknown: the demo vault's module could not be read.</span>
              ) : (
                <>
                  <AddressChip address={status.agent.address} />
                  <SnowtraceLink kind="address" value={status.agent.address} />
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="mono-label">Gas</dt>
            <dd className="tabular mt-1 flex flex-wrap items-center gap-2 font-mono text-sm">
              {formatTokenAmount(BigInt(status.agent.avaxBalance), 18, 4)} AVAX
              {status.agent.lowGas && (
                <span className="inline-flex items-center gap-1 font-bold text-warn">
                  <TriangleAlert aria-hidden className="size-4" /> Low gas
                </span>
              )}
            </dd>
          </div>
        </dl>
      </Chamfer>

      <Chamfer code="LAST TICK" innerClassName="p-0 pb-8">
        {!last ? (
          <p className="px-5 py-5 text-soft">No tick has finished yet.</p>
        ) : (
          <>
            <p className="border-b border-line px-5 py-4 font-mono text-xs uppercase tracking-widest text-soft">
              <time dateTime={last.at} title={new Date(last.at).toLocaleString("en-US")}>
                {timeAgo(last.at)}
              </time>
              {last.blockNumber && ` · block ${BigInt(last.blockNumber).toLocaleString("en-US")}`} · {last.queued} swap{last.queued === 1 ? "" : "s"} queued
            </p>
            {last.skipped.length === 0 ? (
              <p className="px-5 py-4 text-soft">{last.queued > 0 ? "Every vault it looked at got a swap." : "No vault to look at."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {last.skipped.map((s) => (
                  <li key={`${s.safe}-${s.reason}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <AddressChip address={s.safe} />
                    <span className="text-sm text-soft">{skipReason(s.reason)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Chamfer>
    </>
  );
}

// ---------- Activity ----------

const FILTERS: { id: AdminJobFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "blocked", label: "Blocked" },
  { id: "failed", label: "Failed" },
];

function Activity() {
  const overview = useAdminOverview(true);
  const o = overview.data;
  return (
    <>
      {o ? (
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile size="sm" label="Approved · 24 h" value={o.last24h.confirmed.toLocaleString("en-US")} note="trades that landed" tone="ok" />
          <Tile
            size="sm"
            label="Blocked · 24 h"
            value={(o.last24h.rejected + o.last24h.reverted).toLocaleString("en-US")}
            note={`${o.last24h.rejected} by Shield 1 · ${o.last24h.reverted} on-chain`}
            tone={o.last24h.rejected + o.last24h.reverted > 0 ? "danger" : "neutral"}
          />
          <Tile size="sm" label="Failed · 24 h" value={o.last24h.failed.toLocaleString("en-US")} note="infrastructure, not policy" tone={o.last24h.failed > 0 ? "warn" : "neutral"} />
          <Tile size="sm" label="Median finality" value={o.last24h.medianMinedMs === null ? UNKNOWN : seconds(o.last24h.medianMinedMs)} note="send to receipt, recent txs" />
        </dl>
      ) : overview.isError ? (
        <p role="alert" className="text-soft">
          {errorText(overview.error, "Could not load the activity")}
        </p>
      ) : (
        <Skeleton className="h-40 w-full" />
      )}

      <RecentJobs />

      {o && (
        <div className="grid gap-6">
          <Chamfer code="QUEUES" innerClassName="p-0 pb-8">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[22rem] text-left">
                <caption className="sr-only">Jobs in each queue</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="mono-label px-5 py-3 font-normal">
                      Queue
                    </th>
                    {["Waiting", "Active", "Delayed", "Failed"].map((h) => (
                      <th key={h} scope="col" className="mono-label px-2 py-3 text-right font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {o.queues.map((q) => (
                    <tr key={q.name}>
                      <th scope="row" className="px-5 py-3 font-bold capitalize">
                        {q.name}
                      </th>
                      {[q.waiting, q.active, q.delayed, q.failed].map((n, i) => (
                        <td key={i} className={cn("tabular px-2 py-3 text-right font-mono", i === 3 && n > 0 ? "font-bold text-warn" : n === 0 && "text-muted")}>
                          {n.toLocaleString("en-US")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Chamfer>

          <Chamfer code="VAULTS" innerClassName="p-0 pb-8">
            {o.vaults.length === 0 ? (
              <p className="px-5 py-5 text-soft">No vault registered yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {o.vaults.map((v) => (
                  <li key={v.safe} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <AddressChip address={v.safe} />
                      {v.isDemo && <span className="border border-line-strong px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-soft">Demo</span>}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-xs uppercase tracking-widest text-soft">
                        {v.isDemo ? "Visitors only" : v.rebalanceSlot ? `Slot ${v.rebalanceSlot}${o.maxRebalancedVaults ? `/${o.maxRebalancedVaults}` : ""}` : "Not rebalanced"}
                      </span>
                      <Link to={v.isDemo ? "/demo" : `/vaults/${v.safe}`} aria-label={`Open vault ${v.safe}`} className="inline-flex size-8 items-center justify-center text-accent-text hover:bg-hover">
                        <ArrowUpRight aria-hidden className="size-4" />
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Chamfer>
        </div>
      )}
    </>
  );
}

function RecentJobs() {
  const [filter, setFilter] = useState<AdminJobFilter>("all");
  const jobs = useAdminJobs(filter, true);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const items = jobs.data?.pages.flatMap((p) => p.items) ?? [];

  // Roving focus: arrow keys move between the filters.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : FILTERS.length - 1)) % FILTERS.length;
    setFilter(FILTERS[next]!.id);
    tabs.current[next]?.focus();
  };

  return (
    <Chamfer code="RECENT JOBS" innerClassName="p-0 pb-8">
      <div role="tablist" aria-label="Filter jobs" className="grid grid-cols-3 border-b border-line">
        {FILTERS.map((f, i) => (
          <button
            key={f.id}
            ref={(el) => void (tabs.current[i] = el)}
            type="button"
            role="tab"
            id={`admin-jobs-tab-${f.id}`}
            aria-selected={filter === f.id}
            aria-controls="admin-jobs-panel"
            tabIndex={filter === f.id ? 0 : -1}
            onClick={() => setFilter(f.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn("min-h-11 font-bold", filter === f.id ? "bg-ink text-bg" : "text-soft hover:bg-hover hover:text-fg")}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="admin-jobs-panel" aria-labelledby={`admin-jobs-tab-${filter}`}>
        {jobs.isPending ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : jobs.isError ? (
          <p role="alert" className="px-5 py-5 text-soft">
            {errorText(jobs.error, "Could not load the jobs")}
          </p>
        ) : items.length === 0 ? (
          <p className="px-5 py-5 text-soft">{filter === "all" ? "No job yet." : filter === "blocked" ? "Nothing blocked yet." : "No failed job. Good."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((j) => (
              <li
                key={j.id}
                data-aura={j.status === "rejected" || j.status === "reverted" ? "blocked" : undefined}
                className="grid gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]"
              >
                <span className="flex flex-wrap items-center gap-2 sm:block">
                  <time dateTime={j.createdAt} title={new Date(j.createdAt).toLocaleString("en-US")} className="mono-label block">
                    {timeAgo(j.createdAt)}
                  </time>
                  <StatusBadge job={j.status} className="whitespace-nowrap sm:-ml-2 sm:mt-1" />
                </span>
                <span className="min-w-0">
                  <Link to={`/vaults/${j.vault}/activity/${j.id}`} className="inline-flex items-center gap-1 font-bold hover:text-accent-text hover:underline">
                    {jobTitle(j)}
                    <ArrowUpRight aria-hidden className="size-4" />
                  </Link>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-soft">
                    <AddressChip address={j.vault} />
                    {j.reasonCode && <code className="break-all font-mono text-xs">{j.reasonCode}</code>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {jobs.hasNextPage && (
          <div className="border-t border-line px-5 pt-4">
            <button type="button" onClick={() => void jobs.fetchNextPage()} disabled={jobs.isFetchingNextPage} className={secondaryBtn}>
              {jobs.isFetchingNextPage ? "Loading…" : `Load ${ADMIN_JOBS_PAGE} more`}
            </button>
          </div>
        )}
      </div>
    </Chamfer>
  );
}

/** /admin: the operators' console (ui-pages.md §7). The server's AdminGuard is the real gate; this page only hides. */
export function AdminPage({ live = isLive }: { live?: boolean }) {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <main>
        <Access live={live} />
      </main>
      <Footer />
    </div>
  );
}
