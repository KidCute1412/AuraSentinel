import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Settings2, X } from "lucide-react";

/** Mirrors `Role` in @agentshield/shared; switch to the shared type once the web app depends on it (Q4). */
export type SessionRole = "user" | "owner" | "admin";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

/**
 * Admin drawer (D16: no /admin route). Renders nothing unless the session role is `admin`.
 * The role must come from the server session (A9, SIWE + allowlist); there is no client-side way to become admin.
 * Controls are placeholders until the admin API exists.
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
              <section>
                <span className="mono-label">Demo mode · rebalancer</span>
                <p className="mt-2 text-sm text-soft">Tạm dừng / chạy lại rebalancer khi trình diễn. Chưa nối API admin.</p>
                <button type="button" disabled className="mt-3 inline-flex h-10 items-center rounded-none border border-line-strong px-4 font-bold disabled:cursor-not-allowed disabled:opacity-40">
                  Tạm dừng rebalancer
                </button>
              </section>
              <section>
                <span className="mono-label">Gas của agent</span>
                <p className="mt-2 text-sm text-soft">Chưa có dữ liệu.</p>
              </section>
              <section className="space-y-2">
                <span className="mono-label">Công cụ</span>
                <a href={`${API_BASE}/admin/queues`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-bold text-accent-text hover:underline">
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
