import { ChevronLeft, ChevronRight } from "lucide-react";

const btn =
  "inline-flex min-h-10 items-center gap-1 border border-line-strong px-3 font-bold hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

interface Props {
  page: number;
  /** Known when the whole list is on the client; a cursor-paged list only knows whether there is more. */
  pageCount?: number;
  hasNewer: boolean;
  hasOlder: boolean;
  onNewer: () => void;
  onOlder: () => void;
  busy?: boolean;
}

/**
 * Newer / Older pager for every long list (activity, admin jobs). Lists never grow without bound: a fixed page of
 * rows and this bar, so the page height stays the same however long the history gets.
 */
export function Pager({ page, pageCount, hasNewer, hasOlder, onNewer, onOlder, busy }: Props) {
  if (!hasNewer && !hasOlder) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3">
      <button type="button" disabled={!hasNewer || busy} onClick={onNewer} className={btn}>
        <ChevronLeft aria-hidden className="size-4" /> Newer
      </button>
      <span className="tabular font-mono text-xs text-soft" aria-live="polite">
        Page {page}
        {pageCount !== undefined && ` of ${pageCount}`}
      </span>
      <button type="button" disabled={!hasOlder || busy} onClick={onOlder} className={btn}>
        Older <ChevronRight aria-hidden className="size-4" />
      </button>
    </nav>
  );
}
