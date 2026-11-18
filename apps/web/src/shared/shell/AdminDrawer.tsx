import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Pause, Play, Settings2, TriangleAlert, X } from "lucide-react";
import type { Role } from "@agentshield/shared";
import { useRebalancerStatus, useSetRebalancerPaused } from "@/shared/api";
import { zeroAddress } from "viem";
import { API_BASE, API_V1, ApiError } from "@/shared/api/client";
import { formatTokenAmount } from "@/shared/lib/format";
import { timeAgo } from "@/shared/lib/time";
import { AddressChip } from "@/shared/ui/AddressChip";
import { SnowtraceLink } from "@/shared/ui/SnowtraceLink";

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
        aria-label="Admin panel"
        className="inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-none border border-line-strong px-2.5 font-mono text-xs font-bold uppercase tracking-widest hover:bg-hover sm:px-3"
      >
        <Settings2 aria-hidden className="size-4" />
        <span className="hidden sm:inline">Admin</span>
      </button>
      {/* Portaled: the sticky header keeps a transform from its entry animation, which would trap a fixed overlay inside it. */}
      {open && createPortal(
        <div className="fixed inset-0 z-50">
          <div aria-hidden className="absolute inset-0 bg-bg/80" onClick={close} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-line-strong bg-surface shadow-hard"
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
                <a href={`${API_V1}/admin/queues`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-bold text-accent-text hover:underline">
                  Bull Board <ArrowUpRight aria-hidden className="size-4" />
                </a>
                <a href={`${API_BASE}/health`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-bold text-accent-text hover:underline">
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

/** A failed admin call in words: a lost admin role (expired cookie, wallet removed from the list) is not a network fault. */
function adminError(error: Error, what: string): string {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return "Your session is not an admin any more. Reload, or sign in again.";
  }
  return `${what}: ${error.message}`;
}

/** Demo mode (pause the 24/7 rebalancer while presenting) and the agent's gas balance. */
function RebalancerControls() {
  const status = useRebalancerStatus(true);
  const toggle = useSetRebalancerPaused();
  const s = status.data;
  const agentKnown = s && s.agent.address.toLowerCase() !== zeroAddress;

  return (
    <>
      <section>
        <span className="mono-label">Demo mode · rebalancer</span>
        {status.isPending && <div aria-hidden className="mt-3 h-10 animate-pulse bg-hover" />}
        {status.isError && !s && <p role="alert" className="mt-2 text-sm text-soft">{adminError(status.error, "Cannot reach the admin API")}</p>}
        {s && (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {s.paused ? (
                <span className="border border-warn px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-warn">Demo mode on</span>
              ) : (
                <span className="border border-line-strong px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-accent-text">Running</span>
              )}
              <span className="font-mono text-sm text-soft">every {Math.round(s.intervalMs / 1000)}s</span>
            </div>
            <p className="mt-2 text-sm text-soft">
              {s.paused ? "The agent makes no trades on its own. Moves pressed by hand still run." : "The agent rebalances every vault on its own."}
            </p>
            <p className="mt-1 font-mono text-xs text-muted">
              Last run:{" "}
              {s.lastTickAt ? <time dateTime={s.lastTickAt} title={new Date(s.lastTickAt).toLocaleString("en-US")}>{timeAgo(s.lastTickAt)}</time> : "never"}
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
            {toggle.isError && <p role="alert" className="mt-2 text-sm text-soft">{adminError(toggle.error, "Could not change it")}</p>}
          </>
        )}
      </section>
      <section>
        <span className="mono-label">Agent</span>
        {s ? (
          <>
            {agentKnown ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <AddressChip address={s.agent.address} />
                <SnowtraceLink kind="address" value={s.agent.address} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-soft">Unknown: the demo vault's module could not be read.</p>
            )}
            <p className="mt-2 flex items-center gap-2 font-mono text-sm tabular">
              {formatTokenAmount(BigInt(s.agent.avaxBalance), 18, 4)} AVAX
              {s.agent.lowGas && (
                <span className="inline-flex items-center gap-1 font-bold text-warn">
                  <TriangleAlert aria-hidden className="size-4" /> Low gas
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted">Low gas = below the server's AGENT_MIN_GAS_WEI; trades are refused until it is topped up.</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-soft">No data yet.</p>
        )}
      </section>
    </>
  );
}
