import type { JobDto } from "@agentshield/shared";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { Stamp } from "@/shared/ui/Stamp";
import { jobView, type JobTone, type TokenBook } from "../jobView";
import { ExplanationCard } from "./ExplanationCard";

const EDGE: Record<JobTone, string> = {
  ok: "border-l-ok",
  danger: "border-l-danger",
  warn: "border-l-warn",
  pending: "border-l-line-strong",
};

const LABEL: Record<JobTone, string> = {
  ok: "text-accent-text",
  danger: "text-danger-text",
  warn: "text-warn",
  pending: "text-muted",
};

interface JobTimelineProps {
  jobs: readonly JobDto[];
  tokens: TokenBook;
  /** Id of the job whose detail is open (one at a time). */
  openId: string | null;
  onToggle: (id: string) => void;
  /** Renders the audit detail of the open job (fetched by the container). */
  renderDetail: (id: string) => ReactNode;
}

/**
 * Job timeline (design-system §4 "Activity"): time and status in a mono column on the left,
 * bold title on the right, a 4px status edge, stamp + label so color is never the only signal.
 * Sized for a projector: 18-20px titles, 16px body.
 */
export function JobTimeline({ jobs, tokens, openId, onToggle, renderDetail }: JobTimelineProps) {
  return (
    <ol className="space-y-4" aria-label="Dòng thời gian lệnh">
      {jobs.map((job) => (
        <JobRow key={job.id} job={job} tokens={tokens} open={openId === job.id} onToggle={onToggle} renderDetail={renderDetail} />
      ))}
    </ol>
  );
}

interface JobRowProps {
  job: JobDto;
  tokens: TokenBook;
  open: boolean;
  onToggle: (id: string) => void;
  renderDetail: (id: string) => ReactNode;
}

function JobRow({ job, tokens, open, onToggle, renderDetail }: JobRowProps) {
  const v = jobView(job, tokens);
  const detailId = useId();
  return (
    <li className={cn("@container border border-line border-l-4 bg-surface p-4", EDGE[v.tone])} data-status={v.status}>
      {/* Container query, not viewport: the panel sits in a 1/3 column on desktop, so it stacks there too. */}
      <div className="flex flex-col gap-3 @lg:flex-row @lg:gap-4">
        <div className="flex shrink-0 flex-row flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-xs uppercase tracking-widest @lg:w-28 @lg:flex-col @lg:gap-1">
          <time dateTime={job.createdAt} className="tabular text-sm text-soft">
            {v.time}
          </time>
          <span className={cn("font-bold", LABEL[v.tone])}>{v.statusLabel}</span>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 break-words text-lg font-extrabold leading-snug sm:text-xl">{v.title}</h3>
            {v.stamp && (
              <Stamp tone={v.tone === "ok" ? "ok" : v.tone === "danger" ? "danger" : "warn"} animate>
                {v.stamp}
              </Stamp>
            )}
          </div>

          <p className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-sm text-soft">
            <span>{v.origin}</span>
            {v.route && <span aria-hidden>·</span>}
            {v.route && <span>{v.route}</span>}
            {v.amount && <span aria-hidden>·</span>}
            {v.amount && <span className="tabular break-all text-fg">{v.amount}</span>}
          </p>

          {v.deciderLabel && <p className="text-sm text-soft">{v.deciderLabel}</p>}

          {v.reason && (
            <div className="border border-danger bg-tint-pink p-3">
              <p className="font-bold text-danger-text">{v.reason.title}</p>
              <p className="mt-1">{v.reason.message}</p>
              {v.reason.raw && <p className="mt-1 break-all font-mono text-xs text-muted">Mã gốc: {v.reason.raw}</p>}
            </div>
          )}

          {v.txUrl && (
            <a href={v.txUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-accent-text hover:underline">
              Xem giao dịch trên Snowtrace <ArrowUpRight aria-hidden className="size-4" />
            </a>
          )}

          <ExplanationCard explanation={job.explanation} status={job.status} terminal={v.terminal} />

          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => onToggle(job.id)}
            className="inline-flex h-10 items-center gap-2 rounded-none border border-line-strong px-3 font-bold hover:bg-hover"
          >
            Chi tiết kiểm tra
            <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-150", open && "rotate-180")} />
          </button>
          <div id={detailId} hidden={!open}>
            {open && renderDetail(job.id)}
          </div>
        </div>
      </div>
    </li>
  );
}
