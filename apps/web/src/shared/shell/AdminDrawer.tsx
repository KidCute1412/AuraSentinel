import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Pause, Play, Settings2, TriangleAlert, X } from "lucide-react";
import type { Role } from "@agentshield/shared";
import { useRebalancerStatus, useSetRebalancerPaused } from "@/shared/api";
import { API_BASE, API_V1 } from "@/shared/api/client";
import { formatTokenAmount } from "@/shared/lib/format";

/** Session role from the server (`Role` in @agentshield/shared). */
export type SessionRole = Role;

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Admin drawer (D16: no /admin route). Renders nothing unless the session role is `admin`.
 * The role must come from the server session (A9, SIWE + allowlist); there is no client-side way to become admin.
 * Demo mode and the agent's gas come from GET/PATCH /admin/rebalancer (api.md #15, #16), fetched only while open.
 * The panel is rendered into document.body: the header animates with a transform, and a `fixed` child of a
 * transformed ancestor is positioned against that ancestor instead of the viewport.
 */
export function AdminDrawer({ role }: { role: SessionRole | null | undefined }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === "Tab" && panelRef.current) {
        // Modal: Tab and Shift+Tab cycle inside the panel.
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
        aria-label="Admin panel"
        className="inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-none border border-line-strong px-2.5 font-mono text-xs font-bold uppercase tracking-widest text-fg hover:bg-hover sm:px-3"
      >
        <Settings2 aria-hidden className="size-4" />
        <span aria-hidden className="hidden sm:inline">Admin</span>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[65]">
            <div aria-hidden className="absolute inset-0 bg-bg/80" onClick={close} />
            <aside
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-line-strong bg-surface shadow-hard animate-feed-in"
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 id={titleId} className="text-xl font-extrabold">Admin panel</h2>
                <button ref={closeRef} type="button" onClick={close} aria-label="Close admin panel" className="inline-flex size-10 items-center justify-center hover:bg-hover">
                  <X aria-hidden className="size-5" />
                </button>
              </div>
              <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
                <RebalancerControls />
                <section className="space-y-2">
                  <span className="mono-label">Tools</span>
                  <a href={`${API_V1}/admin/queues`} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-1 font-bold text-accent-text hover:underline">
                    Bull Board <ArrowUpRight aria-hidden className="size-4" />
                  </a>
                  <a href={`${API_BASE}/health`} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-1 font-bold text-accent-text hover:underline">
                    Health check <ArrowUpRight aria-hidden className="size-4" />
                  </a>
                </section>
              </div>
            </aside>
          </div>,
          document.body,
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
        {status.isError && <p className="mt-2 text-sm text-soft">Cannot reach the admin API: {status.error.message}</p>}
        {s && (
          <>
            <p className="mt-2 font-mono text-sm">
              {s.paused ? "PAUSED" : "RUNNING"} · every {Math.round(s.intervalMs / 1000)}s
            </p>
            <p className="mt-1 text-sm text-soft">
              {s.paused
                ? "Demo mode is on: the rebalancer creates no jobs, so the stage vault only moves when you press a button."
                : "The rebalancer is trading on every enabled vault. Pause it before presenting."}
            </p>
            <button
              type="button"
              disabled={toggle.isPending}
              aria-pressed={s.paused}
              onClick={() => toggle.mutate(!s.paused)}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-none border border-line-strong px-4 font-bold hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {s.paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
              {s.paused ? "Resume rebalancer" : "Pause rebalancer"}
            </button>
            {toggle.isError && <p className="mt-2 text-sm text-soft">Could not change it: {toggle.error.message}</p>}
          </>
        )}
      </section>
      <section>
        <span className="mono-label">Agent gas</span>
        {s ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-sm tabular">
            {formatTokenAmount(BigInt(s.agent.avaxBalance), 18)} AVAX
            {s.agent.lowGas && (
              <span className="inline-flex items-center gap-1 font-bold text-warn">
                <TriangleAlert aria-hidden className="size-4" /> Low gas
              </span>
            )}
          </p>
        ) : (
          <p className="mt-2 text-sm text-soft">No data yet.</p>
        )}
      </section>
    </>
  );
}
