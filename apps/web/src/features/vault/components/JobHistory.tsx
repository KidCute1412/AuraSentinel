import { Link } from "react-router-dom";
import { fromAmount, type JobDetailDto } from "@agentshield/shared";
import { cn } from "@/shared/lib/cn";
import { formatTokenAmount } from "@/shared/lib/format";
import { timeAgo } from "@/shared/lib/time";
import { Panel } from "@/shared/ui/Panel";
import { StatusBadge } from "@/shared/ui/StatusBadge";

export function jobLabel(j: JobDetailDto): string {
  const amount = j.intent && j.intent.amountIn !== "0" ? ` · ${formatTokenAmount(fromAmount(j.intent.amountIn), 6)} USDC` : "";
  if (j.origin === "redteam") return `Attack${amount}`;
  return `Rebalance${amount}`;
}

interface Props {
  jobs: JobDetailDto[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** Where "View all" goes; omitted on /demo, which has no sub-pages. */
  allHref?: string;
  limit?: number;
}

/** Latest jobs, newest first. Selecting one shows its verdict above. Keyboard and screen-reader friendly buttons. */
export function JobHistory({ jobs, selectedId, onSelect, allHref, limit = 6 }: Props) {
  const shown = jobs.slice(0, limit);
  return (
    <Panel title="Recent jobs" aside={<span className="rounded-pill bg-highlight px-2 py-0.5 font-mono text-[11px] font-bold text-on-accent">{jobs.length}</span>}>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nothing has happened yet. Run a rebalance or try an attack.</p>
      ) : (
        <ul className="-mx-4 -my-4 divide-y divide-line">
          {shown.map((j) => (
            <li key={j.id}>
              <button
                type="button"
                onClick={() => onSelect(j.id)}
                aria-pressed={j.id === selectedId}
                className={cn("flex min-h-14 w-full items-center justify-between gap-3 border-l-4 px-4 py-2 text-left hover:bg-hover", j.id === selectedId ? "border-accent bg-hover" : "border-transparent")}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{jobLabel(j)}</span>
                  <span className="mono-label block truncate">{timeAgo(j.createdAt)}{j.reasonCode && <span className="normal-case tracking-normal"> · {j.reasonCode}</span>}</span>
                </span>
                <StatusBadge job={j.status} className="shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {allHref && jobs.length > limit && (
        <p className="mt-6 border-t border-line pt-3">
          <Link to={allHref} className="font-mono text-xs font-bold uppercase tracking-wider text-accent-text hover:underline">View all {jobs.length} jobs</Link>
        </p>
      )}
    </Panel>
  );
}
