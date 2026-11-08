import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface Props {
  title: string;
  /** Right side of the header: a count, a badge or a small action. */
  aside?: ReactNode;
  tone?: "default" | "danger";
  children: ReactNode;
  className?: string;
}

/** Standard card: surface, 1px line, hard shadow, mono label header (design-system §3 Card). */
export function Panel({ title, aside, tone = "default", children, className }: Props) {
  return (
    <section className={cn("border bg-surface shadow-hard", tone === "danger" ? "border-danger" : "border-line", className)}>
      <header className="flex min-h-10 items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h2 className="mono-label">{title}</h2>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
