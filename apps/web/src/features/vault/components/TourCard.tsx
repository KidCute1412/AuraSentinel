import { Check, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/lib/cn";
import type { TourStep } from "../lib/tour";

/** Static 4-step guide for /demo. Ticks itself off from what the visitor really did (see lib/tour). */
export function TourCard({ steps }: { steps: TourStep[] }) {
  const [hidden, setHidden] = useState(false);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  if (hidden) return null;
  return (
    <section aria-label="Guided tour" className="border border-line bg-surface shadow-hard">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h2 className="mono-label">Try it in 4 steps</h2>
        <div className="flex items-center gap-2">
          <span className="rounded-pill bg-highlight px-2 py-0.5 font-mono text-[11px] font-bold text-on-accent">{done}/4</span>
          <button type="button" onClick={() => setHidden(true)} aria-label="Hide the guide" className="inline-flex size-8 items-center justify-center hover:bg-hover">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </header>
      <ol className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => {
          const isNext = next?.id === s.id;
          return (
            <li key={s.id} className={cn("flex gap-3 bg-surface p-4", isNext && "bg-hover")} aria-current={isNext ? "step" : undefined}>
              <span className={cn("inline-flex size-7 shrink-0 items-center justify-center font-mono text-xs font-bold", s.done ? "bg-accent text-on-accent" : "border border-line-strong")}>
                {s.done ? <Check aria-hidden strokeWidth={3} className="size-4" /> : `0${i + 1}`}
              </span>
              <div>
                <p className={cn("text-sm font-bold", s.done && "text-muted line-through")}>{s.title}</p>
                <p className="mt-0.5 text-xs text-soft">{s.hint}</p>
                <span className="sr-only">{s.done ? "Done" : isNext ? "Next step" : "Not started"}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
