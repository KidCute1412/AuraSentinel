import { Bot, BrainCircuit, Check, Rss, TriangleAlert } from "lucide-react";
import type { AgentPlan } from "@agentshield/shared";
import { cn } from "@/shared/lib/cn";
import { Skeleton } from "@/shared/ui/Skeleton";
import { planView } from "../lib/agentPlan";

/** Sections appear one after another, like the agent thinking out loud (each a 200ms slide-in). */
const STAGGER_MS = 120;

/**
 * Hijacked Agent: what the fooled AI read and decided, above the shields that judge it. `plan` null = the brain is
 * still reading the feed. The plan is attacker-controlled: nothing on this card is a verdict, the pipeline is.
 */
export function AgentBrainCard({ plan }: { plan: AgentPlan | null | undefined }) {
  if (!plan) {
    return (
      <section aria-label="The agent's brain" aria-busy className="border border-line bg-bg">
        <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <BrainCircuit aria-hidden className="size-4" />
          <span className="mono-label">The agent&apos;s brain · reading the feed…</span>
        </header>
        <div className="space-y-2 p-4">
          <Skeleton className="h-3.5 w-10/12" />
          <Skeleton className="h-3.5 w-7/12" />
          <Skeleton className="h-16 w-full" />
        </div>
      </section>
    );
  }

  const v = planView(plan);
  return (
    <section aria-label="What the hijacked agent decided" className="border border-line bg-bg">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <span className="inline-flex items-center gap-2">
          <BrainCircuit aria-hidden className="size-4" />
          <span className="mono-label">The agent&apos;s brain · hijacked</span>
        </span>
        <span
          className={cn("border px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest", v.sourceIsLlm ? "border-accent text-accent-text" : "border-line-strong text-soft")}
          title={v.sourceIsLlm ? "This plan was written by a language model playing a fooled agent." : "The language model was not used, so a keyword planner played the fooled agent."}
        >
          {v.source}
        </span>
      </header>

      <div className="space-y-3 p-4">
        <figure className="animate-feed-in border-l-4 border-warn bg-tint-amber px-3 py-2">
          <figcaption className="mono-label flex items-center gap-1.5">
            <Rss aria-hidden className="size-3.5" />
            Market feed · unverified account
          </figcaption>
          <blockquote className="mt-1 break-words text-sm text-fg">{plan.feed}</blockquote>
        </figure>

        <p className="animate-feed-in flex gap-2 text-sm" style={{ animationDelay: `${STAGGER_MS}ms` }}>
          <Bot aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="mono-label mr-2">It thought</span>
            <span className="italic text-soft">&ldquo;{plan.thought}&rdquo;</span>
          </span>
        </p>

        <div className="animate-feed-in border border-line-strong bg-surface" style={{ animationDelay: `${STAGGER_MS * 2}ms` }}>
          <p className="border-b border-line px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-widest">
            Its plan <span className="text-muted">·</span> {v.title}
          </p>
          <dl className="divide-y divide-line">
            {v.rows.map((r) => (
              <div key={r.label} className={cn("grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-x-3 px-3 py-2", r.danger && "bg-tint-pink")}>
                <dt className="font-mono text-[11px] uppercase tracking-widest text-muted">{r.label}</dt>
                <dd className="min-w-0 text-right">
                  <span className={cn("tabular break-words font-mono text-sm", r.danger && "font-bold text-danger-text")}>{r.value}</span>
                  {r.danger && (
                    <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-bold text-danger-text">
                      <TriangleAlert aria-hidden strokeWidth={2.5} className="size-3 shrink-0" />
                      {r.danger}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="animate-feed-in" style={{ animationDelay: `${STAGGER_MS * 3}ms` }}>
          {v.flags.length > 0 ? (
            <ul aria-label="What makes this plan dangerous" className="flex flex-wrap gap-1.5">
              {v.flags.map((f) => (
                <li key={f.id} className="inline-flex items-center gap-1 border border-danger px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-danger-text">
                  <TriangleAlert aria-hidden strokeWidth={2.5} className="size-3" />
                  {f.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-accent-text">
              <Check aria-hidden strokeWidth={3} className="size-4" />
              {plan.action.type === "none" ? "Nothing to do: it found no order in the feed." : "Nothing unusual: a trade inside the rules."}
            </p>
          )}
          <p className="mt-2 text-xs text-muted">This agent is gullible on purpose. The shields below keep the money safe, not the AI.</p>
        </div>
      </div>
    </section>
  );
}
