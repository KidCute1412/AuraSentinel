import { Check, ChevronLeft, ChevronRight, ChevronRightSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { reasonTitle } from "@/shared/api/mockEngine";
import { JOBS_PAGE_SIZE } from "@/shared/api/hooks";
import { useVaultFeed } from "@/shared/api/vaultFeed";
import type { VaultView } from "@/shared/api/vaultSource";
import { cn } from "@/shared/lib/cn";
import { timeAgo } from "@/shared/lib/time";
import { Panel } from "@/shared/ui/Panel";
import { Skeleton } from "@/shared/ui/Skeleton";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { jobLabel } from "../components/JobHistory";
import { canRunJobs, sectionPath, type VaultRole } from "../guards/access";
import { activityParams, filterJobs, hasFilter, parseActivityFilter, type ActivityFilter, type ActivityStatus, type ActivityType } from "../lib/activity";

const STATUS_OPTIONS: { value: ActivityStatus | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "confirmed", label: "Safe" },
  { value: "rejected", label: "Shield 1 blocked" },
  { value: "reverted", label: "Shield 2 blocked" },
  { value: "failed", label: "Infra error" },
];

const TYPE_OPTIONS: { value: ActivityType | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "rebalance", label: "Rebalance" },
  { value: "attack", label: "Attack" },
];

const chip = "inline-flex min-h-10 items-center gap-1.5 border px-3 font-mono text-xs font-bold uppercase tracking-wider";

function FilterGroup<T extends string>({ label, options, value, onPick }: { label: string; options: { value: T | null; label: string }[]; value: T | null; onPick: (v: T | null) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="mono-label w-14 shrink-0">{label}</span>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.label} type="button" aria-pressed={on} onClick={() => onPick(o.value)} className={cn(chip, on ? "border-accent bg-hover text-fg" : "border-line text-soft hover:bg-hover hover:text-fg")}>
            {on && <Check aria-hidden strokeWidth={3} className="size-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * /vaults/:safe/activity (ui-pages §10.1): every job of the vault, newest first, filtered from the query string so a
 * view can be shared. Rows open the job page. New jobs slide in at the top without moving what is already on screen.
 */
export function Activity({ view, role }: { view: VaultView; role: VaultRole }) {
  const feed = useVaultFeed(view);
  const ready = feed.jobsStatus === "ready";
  const canAct = canRunJobs(role, view.isDemo, feed.source);
  const [params, setParams] = useSearchParams();
  const filter = parseActivityFilter(params);
  // Ids on screen at first paint: only jobs that arrive later get the slide-in.
  const [known, setKnown] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (ready && known === null) setKnown(new Set(feed.jobs.map((j) => j.id)));
  }, [ready, feed.jobs, known]);

  if (!(view.chain.moduleEnabled && view.chain.policyActive)) {
    return (
      <Panel title="Activity">
        <p className="text-soft">This vault is not set up yet, so the agent has not done anything.</p>
      </Panel>
    );
  }
  if (feed.jobsStatus === "unavailable") {
    return (
      <Panel title="Activity">
        <p role="alert" className="text-soft">Could not load the activity from the server. Nothing is wrong with the vault itself; this is a display problem only.</p>
        <button type="button" onClick={feed.refetch} className="mt-4 min-h-10 border border-line-strong px-4 font-bold hover:bg-hover">Try again</button>
      </Panel>
    );
  }
  if (!ready) return <Skeleton className="h-96 w-full" />;
  const jobs = feed.jobs;

  const go = (next: ActivityFilter) => setParams(activityParams(next));
  const pick = (patch: Partial<ActivityFilter>) => go({ ...filter, ...patch, page: 1 });
  const page = filterJobs(jobs, filter);
  const jobHref = (id: string) => `${sectionPath(view.safe, "activity")}/${id}`;

  return (
    <Panel title="Activity" aside={<span className="rounded-pill bg-highlight px-2 py-0.5 font-mono text-[11px] font-bold text-on-accent">{page.total}</span>}>
      <div className="space-y-3 border-b border-line pb-4">
        <FilterGroup label="Status" options={STATUS_OPTIONS} value={filter.status} onPick={(status) => pick({ status })} />
        <FilterGroup label="Type" options={TYPE_OPTIONS} value={filter.type} onPick={(type) => pick({ type })} />
        {hasFilter(filter) && (
          <button type="button" onClick={() => go({ status: null, type: null, page: 1 })} className="font-mono text-xs font-bold uppercase tracking-wider text-accent-text underline-offset-4 hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="py-10 text-center">
          <p className="font-bold">No activity yet</p>
          <p className="mt-1 text-sm text-soft">Jobs show up here as soon as the agent or a red-team test starts one.</p>
          <Link to={sectionPath(view.safe, canAct ? "red-team" : "overview")} className="mt-4 inline-block font-bold text-accent-text underline underline-offset-4">
            {canAct ? "Run a rebalance or an attack" : "Back to the overview"}
          </Link>
        </div>
      ) : page.total === 0 ? (
        <div className="py-10 text-center">
          <p className="font-bold">No job matches these filters</p>
          <button type="button" onClick={() => go({ status: null, type: null, page: 1 })} className="mt-3 min-h-10 border border-line-strong px-4 font-bold hover:bg-hover">
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="-mx-4 divide-y divide-line">
          {page.items.map((j) => (
            <li key={j.id} className={cn(known !== null && !known.has(j.id) && "animate-feed-in")}>
              <Link to={jobHref(j.id)} className="group flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-hover">
                <span className="min-w-0">
                  <span className="block truncate font-bold">{jobLabel(j)}</span>
                  <span className="mt-0.5 block truncate text-sm text-soft">
                    <time dateTime={j.createdAt} title={new Date(j.createdAt).toLocaleString("en-US")}>{timeAgo(j.createdAt)}</time>
                    {j.reasonCode && (
                      <>
                        <span className="mx-1.5 text-muted">·</span>
                        <span className="font-mono text-xs text-danger-text">{j.reasonCode}</span>
                        <span className="hidden sm:inline"> {reasonTitle(j.reasonCode)}</span>
                      </>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusBadge job={j.status} />
                  <ChevronRightSquare aria-hidden className="size-4 text-muted group-hover:text-fg" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {page.pageCount > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
          <button type="button" disabled={page.page <= 1} onClick={() => go({ ...filter, page: page.page - 1 })} className="inline-flex min-h-10 items-center gap-1 border border-line-strong px-3 font-bold hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">
            <ChevronLeft aria-hidden className="size-4" /> Newer
          </button>
          <span className="tabular font-mono text-xs text-soft">
            Page {page.page} of {page.pageCount}
          </span>
          <button type="button" disabled={page.page >= page.pageCount} onClick={() => go({ ...filter, page: page.page + 1 })} className="inline-flex min-h-10 items-center gap-1 border border-line-strong px-3 font-bold hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">
            Older <ChevronRight aria-hidden className="size-4" />
          </button>
        </nav>
      )}
      {feed.hasMoreJobs && (
        <p className="mt-4 border-t border-line pt-3 font-mono text-xs text-muted">Showing the latest {JOBS_PAGE_SIZE} jobs. Older jobs are kept on the server.</p>
      )}
    </Panel>
  );
}
