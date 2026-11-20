import { ChevronRight, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { AgentPlan } from "@agentshield/shared";
import { cn } from "@/shared/lib/cn";
import { Skeleton } from "@/shared/ui/Skeleton";
import { planView } from "../lib/agentPlan";

/**
 * One step of the attack story: a number, a title, an optional note on the right, then the body. The hijack is read
 * top to bottom as ① the bait → ② the AI's plan → ③ the shields (the pipeline, rendered by the caller under step 3).
 */
export function AttackStep({ n, title, aside, children }: { n: 1 | 2 | 3; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
      <span aria-hidden className="flex size-6 items-center justify-center border-2 border-fg font-mono text-xs font-bold">
        {n}
      </span>
      <div className="min-w-0">
        <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h4 className="font-mono text-xs font-bold uppercase tracking-widest">{title}</h4>
          {aside}
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </section>
  );
}

/** Long feed items fold to three lines; the full text is one click away (and always in the DOM for screen readers). */
const FOLD_AT = 160;

/**
 * Hijacked Agent: steps ① and ② of the attack story, what the fooled AI read and what it planned. `plan` null = the
 * brain is still reading. The plan is attacker-controlled: nothing here is a verdict, the shields in step ③ are.
 */
export function AgentBrainCard({ plan }: { plan: AgentPlan | null | undefined }) {
  if (!plan) {
    return (
      <div aria-label="The agent's brain" aria-busy className="space-y-4">
        <AttackStep n={1} title="The bait">
          <Skeleton className="h-12 w-full" />
        </AttackStep>
        <AttackStep n={2} title="The AI is reading it…">
          <Skeleton className="h-20 w-full" />
        </AttackStep>
      </div>
    );
  }

  const v = planView(plan);
  const long = plan.feed.length > FOLD_AT;
  const source = (
    <span
      className={cn("border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest", v.sourceIsLlm ? "border-accent text-accent-text" : "border-line-strong text-soft")}
      title={v.sourceIsLlm ? "Planned by a language model playing a fooled agent." : "The language model was not used, so a keyword planner played the fooled agent."}
    >
      {v.source}
    </span>
  );

  return (
    <div role="region" aria-label="What the hijacked agent decided" className="space-y-4">
      <AttackStep n={1} title="The bait" aside={<span className="font-mono text-[10px] uppercase tracking-widest text-muted">Market feed · unverified</span>}>
        <blockquote className={cn("animate-feed-in break-words border-l-4 border-warn bg-tint-amber px-3 py-2 text-sm text-fg", long && "line-clamp-3")}>{plan.feed}</blockquote>
        {long && (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer font-mono uppercase tracking-widest text-soft hover:text-fg">Show the whole message</summary>
            <p className="mt-1 break-words text-sm text-soft">{plan.feed}</p>
          </details>
        )}
      </AttackStep>

      <AttackStep n={2} title={plan.action.type === "none" ? "The AI's plan · nothing" : `The AI's plan · ${v.title}`} aside={source}>
        <div className="animate-feed-in border border-line-strong bg-bg" style={{ animationDelay: "120ms" }}>
          <dl className="divide-y divide-line">
            {v.rows.map((r) => (
              <div key={r.label} className={cn("grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-x-3 px-3 py-1.5", r.danger && "bg-tint-pink")}>
                <dt className="self-center font-mono text-[11px] uppercase tracking-widest text-muted">{r.label}</dt>
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
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-soft hover:text-fg [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
            Why the AI did it
          </summary>
          <p className="mt-1.5 border-l-2 border-line-strong pl-3 text-sm italic text-soft">&ldquo;{plan.thought}&rdquo;</p>
        </details>
        <p className="mt-1.5 text-xs text-muted">
          {v.flags.length > 0 ? "This AI is gullible on purpose: the shields below are what keep the money safe." : "Nothing in this plan breaks a rule. The shields still check it."}
        </p>
      </AttackStep>
    </div>
  );
}
