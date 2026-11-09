import { CircleAlert, Inbox, RotateCw } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useJob, useJobs, useVaultEvents, useVaultState } from "@/shared/api";
import { JobDetail } from "./components/JobDetail";
import { JobTimeline } from "./components/JobTimeline";
import { tokenBook, type TokenBook } from "./jobView";

/**
 * Activity panel (Q9): live job timeline of one vault, kept current by the SSE bridge.
 * Without a vault address (public demo vault not deployed yet, L4) it renders an honest empty
 * state and calls no hooks, so it also works outside a QueryClientProvider.
 */
export function ActivityPanel({ safe }: { safe: string | null }) {
  if (!safe) {
    return (
      <Frame>
        <Notice icon={<Inbox aria-hidden className="size-5" />} title="Chưa có lệnh nào">
          Vault demo chưa được deploy lên Avalanche Fuji (L4), nên chưa có lệnh nào để hiện.
        </Notice>
      </Frame>
    );
  }
  return <ActivityLive safe={safe} />;
}

function ActivityLive({ safe }: { safe: string }) {
  // The one SSE connection for this vault (web-dashboard skill); job events patch the cache below.
  useVaultEvents(safe);
  const jobs = useJobs(safe);
  const state = useVaultState(safe);
  const tokens = useMemo(() => tokenBook(state.data), [state.data]);
  const [openId, setOpenId] = useState<string | null>(null);

  let body: ReactNode;
  if (jobs.isPending) {
    body = (
      <div aria-busy="true" className="space-y-4">
        <span className="sr-only">Đang tải dòng thời gian</span>
        {[0, 1].map((i) => (
          <div key={i} aria-hidden className="h-40 animate-pulse border border-line bg-hover" />
        ))}
      </div>
    );
  } else if (jobs.isError) {
    body = (
      <Notice icon={<CircleAlert aria-hidden className="size-5 text-warn" />} title="Chưa kết nối được API vault">
        <span>{jobs.error.message}</span>
        <button
          type="button"
          onClick={() => void jobs.refetch()}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-none border border-line-strong px-3 font-bold hover:bg-hover"
        >
          <RotateCw aria-hidden className="size-4" /> Thử lại
        </button>
      </Notice>
    );
  } else if (jobs.data.items.length === 0) {
    body = (
      <Notice icon={<Inbox aria-hidden className="size-5" />} title="Chưa có lệnh nào">
        Bấm “Chạy rebalance” hoặc thử một đòn tấn công: kết quả sẽ hiện ở đây ngay khi máy chủ xử lý xong.
      </Notice>
    );
  } else {
    body = (
      <JobTimeline
        jobs={jobs.data.items}
        tokens={tokens}
        openId={openId}
        onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
        renderDetail={(id) => <JobDetailLoader id={id} tokens={tokens} />}
      />
    );
  }

  return <Frame count={jobs.data?.items.length}>{body}</Frame>;
}

function JobDetailLoader({ id, tokens }: { id: string; tokens: TokenBook }) {
  const q = useJob(id);
  return <JobDetail detail={q.data} isLoading={q.isPending} isError={q.isError} tokens={tokens} />;
}

function Frame({ count, children }: { count?: number; children: ReactNode }) {
  return (
    <section aria-labelledby="activity-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="activity-title" className="text-xl font-extrabold">
          Dòng thời gian lệnh
        </h2>
        {count !== undefined && count > 0 && (
          <span className="rounded-pill bg-highlight px-2 py-0.5 font-mono text-xs font-bold text-on-accent">{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div role="status" className="border border-dashed border-line-strong p-4">
      <p className="flex items-center gap-2 font-bold">
        {icon}
        {title}
      </p>
      <div className="mt-1 flex flex-col items-start text-soft">{children}</div>
    </div>
  );
}
