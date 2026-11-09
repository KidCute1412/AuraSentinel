import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export interface Crumb {
  label: string;
  to?: string;
  mono?: boolean;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="font-mono text-xs text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
              {c.to && !last ? (
                <Link to={c.to} className="hover:text-fg hover:underline underline-offset-4">{c.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-fg" : undefined}>{c.label}</span>
              )}
              {!last && <ChevronRight aria-hidden className="size-3" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
