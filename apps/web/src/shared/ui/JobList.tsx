import { ChevronRightSquare } from "lucide-react";
import { Link } from "react-router-dom";
import type { JobDto } from "@agentshield/shared";
import { reasonTitle } from "@/shared/api/mockEngine";
import { shortAddress } from "@/shared/lib/address";
import { cn } from "@/shared/lib/cn";
import { groundId } from "@/shared/lib/ground";
import { jobLabel } from "@/shared/lib/jobLabel";
import { clockTime, groupByDay, timeAgo } from "@/shared/lib/time";
import { StatusBadge } from "./StatusBadge";

type Job = Pick<JobDto, "id" | "vault" | "status" | "kind" | "origin" | "intent" | "reasonCode" | "createdAt">;

interface Props {
  /** One page of jobs, newest first. */
  jobs: readonly Job[];
  href: (job: Job) => string;
  /** Lists that mix vaults (admin) name the vault on each row. */
  showVault?: boolean;
  /** Ids already on screen at first paint: other rows slide in. Omit to animate nothing. */
  known?: ReadonlySet<string> | null;
}

/**
 * The one row style for job history (activity page, admin console): a compact single row per job, grouped under a
 * day label, the whole row a link to the job page. Pair it with `Pager` so a long history stays one screen tall.
 */
export function JobList({ jobs, href, showVault, known }: Props) {
  return (
    <div>
      {groupByDay(jobs).map((day) => (
        <section key={day.key} aria-label={day.label}>
          <h3 className="flex items-center justify-between border-y border-line bg-hover px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-soft">
            <span>{day.label}</span>
            <span className="tabular">{day.items.length}</span>
          </h3>
          <ul className="divide-y divide-line">
            {day.items.map((j) => (
              <li
                key={j.id}
                data-ground={groundId("joblist", j.id.slice(0, 8))}
                data-aura={j.status === "rejected" || j.status === "reverted" ? "blocked" : undefined}
                className={cn(known && !known.has(j.id) && "animate-feed-in")}
              >
                <Link to={href(j)} className="group flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 hover:bg-hover">
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{jobLabel(j)}</span>
                    <span className="mt-0.5 block truncate text-sm text-soft">
                      <time dateTime={j.createdAt} title={`${new Date(j.createdAt).toLocaleString("en-US")} · ${timeAgo(j.createdAt)}`} className="tabular font-mono text-xs">
                        {clockTime(j.createdAt)}
                      </time>
                      {showVault && (
                        <>
                          <span className="mx-1.5 text-muted">·</span>
                          <span className="font-mono text-xs" title={j.vault}>
                            {shortAddress(j.vault)}
                          </span>
                        </>
                      )}
                      {j.reasonCode && (
                        <>
                          <span className="mx-1.5 text-muted">·</span>
                          <span className="font-mono text-xs text-danger-text">{j.reasonCode}</span>
                          {reasonTitle(j.reasonCode) !== j.reasonCode && <span className="hidden sm:inline"> {reasonTitle(j.reasonCode)}</span>}
                        </>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge job={j.status} className="whitespace-nowrap" />
                    <ChevronRightSquare aria-hidden className="size-4 text-muted group-hover:text-fg" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
