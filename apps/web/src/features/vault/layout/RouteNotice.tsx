import { X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";

/** One-line notice carried through `navigate(..., { state: { notice } })`, e.g. after a guard redirect. */
export function RouteNotice() {
  const { state, key } = useLocation() as { state: { notice?: string } | null; key: string };
  const [dismissed, setDismissed] = useState<string | null>(null);
  const notice = state?.notice;
  if (!notice || dismissed === key) return null;
  return (
    <div role="status" className="flex items-start justify-between gap-3 border-2 border-on-accent bg-highlight px-4 py-3 text-sm font-bold text-on-accent">
      <span>{notice}</span>
      <button type="button" onClick={() => setDismissed(key)} aria-label="Dismiss notice" className="-m-1 inline-flex size-8 shrink-0 items-center justify-center hover:bg-on-accent/10">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
