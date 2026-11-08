import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play, Settings2, TriangleAlert, X } from "lucide-react";
import { formatAmountVi, type Role } from "@agentshield/shared";
import { useRebalancerStatus, useSetRebalancerPaused } from "@/shared/api";
import { API_BASE, API_V1 } from "@/shared/api/client";

/** Session role from the server (`Role` in @agentshield/shared). */
export type SessionRole = Role;

/**
 * Admin drawer (D16: no /admin route). Renders nothing unless the session role is `admin`.
 * The role must come from the server session (A9, SIWE + allowlist); there is no client-side way to become admin.
 * Demo mode and the agent's gas come from GET/PATCH /admin/rebalancer (api.md #15, #16), fetched only while open.
 */
export function AdminDrawer({ role }: { role: SessionRole | null | undefined }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (role !== "admin") return null;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-2 rounded-none border border-line-strong px-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-hover"
      >
        <Settings2 aria-hidden className="size-4" />
        Admin
      </button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div aria-hidden className="absolute inset-0 bg-bg/80" onClick={close} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-line-strong bg-surface shadow-hard"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 id={titleId} className="text-xl font-extrabold">Bảng admin</h2>
              <button ref={closeRef} type="button" onClick={close} aria-label="Đóng bảng admin" className="inline-flex size-10 items-center justify-center hover:bg-hover">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <RebalancerControls />
              <section className="space-y-2">
                <span className="mono-label">Công cụ</span>
                <a href={`${API_V1}/admin/queues`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-bold text-accent-text hover:underline">
                  Bull Board <ArrowUpRight aria-hidden className="size-4" />
                </a>
                <a href={`${API_BASE}/health`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-bold text-accent-text hover:underline">
                  Health check <ArrowUpRight aria-hidden className="size-4" />
                </a>
              </section>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

/** Demo mode (pause the 24/7 rebalancer while presenting) and the agent's gas balance. */
function RebalancerControls() {
  const status = useRebalancerStatus(true);
  const toggle = useSetRebalancerPaused();
  const s = status.data;

  return (
    <>
      <section>
        <span className="mono-label">Demo mode · rebalancer</span>
        {status.isPending && <div aria-hidden className="mt-3 h-10 animate-pulse bg-hover" />}
        {status.isError && <p className="mt-2 text-sm text-soft">Chưa kết nối được API admin: {status.error.message}</p>}
        {s && (
          <>
            <p className="mt-2 font-mono text-sm">
              {s.paused ? "ĐANG TẠM DỪNG" : "ĐANG CHẠY"} · mỗi {Math.round(s.intervalMs / 1000)} giây
            </p>
            <button
              type="button"
              disabled={toggle.isPending}
              aria-pressed={s.paused}
              onClick={() => toggle.mutate(!s.paused)}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-none border border-line-strong px-4 font-bold hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {s.paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
              {s.paused ? "Chạy lại rebalancer" : "Tạm dừng rebalancer"}
            </button>
            {toggle.isError && <p className="mt-2 text-sm text-soft">Không đổi được: {toggle.error.message}</p>}
          </>
        )}
      </section>
      <section>
        <span className="mono-label">Gas của agent</span>
        {s ? (
          <p className="mt-2 flex items-center gap-2 font-mono text-sm tabular">
            {formatAmountVi(BigInt(s.agent.avaxBalance), 18, "AVAX")}
            {s.agent.lowGas && (
              <span className="inline-flex items-center gap-1 font-bold text-warn">
                <TriangleAlert aria-hidden className="size-4" /> Sắp hết gas
              </span>
            )}
          </p>
        ) : (
          <p className="mt-2 text-sm text-soft">Chưa có dữ liệu.</p>
        )}
      </section>
    </>
  );
}
