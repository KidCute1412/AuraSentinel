import { Check, Circle, Minus, X } from "lucide-react";
import type { JobDetailDto } from "@agentshield/shared";
import { cn } from "@/shared/lib/cn";
import { timelineSteps, type StepState } from "../lib/timeline";

const MARK: Record<StepState, { box: string; label: string }> = {
  pending: { box: "border-line-strong text-muted", label: "waiting" },
  active: { box: "border-fg bg-hover text-fg animate-pulse motion-reduce:animate-none", label: "running" },
  pass: { box: "border-accent bg-accent text-on-accent", label: "passed" },
  fail: { box: "border-danger bg-danger text-white", label: "blocked" },
  skipped: { box: "border-line text-muted", label: "skipped" },
};

function Icon({ state }: { state: StepState }) {
  const cls = "size-4";
  if (state === "pass") return <Check aria-hidden strokeWidth={3} className={cls} />;
  if (state === "fail") return <X aria-hidden strokeWidth={3} className={cls} />;
  if (state === "skipped") return <Minus aria-hidden className={cls} />;
  return <Circle aria-hidden className={cn(cls, "size-3")} />;
}

/** Shield 1 (pre-check, simulation, invariants) then Shield 2 (on-chain). Text + icon + color, never color alone. */
export function JobTimeline({ job }: { job: JobDetailDto }) {
  const steps = timelineSteps(job);
  return (
    <ol aria-label="Job pipeline" className="space-y-0">
      {steps.map((s, i) => (
        <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden className="absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px bg-line-strong" />}
          <span className={cn("relative z-10 inline-flex size-7 shrink-0 items-center justify-center border-2", MARK[s.state].box)}>
            <Icon state={s.state} />
          </span>
          <div className="min-w-0 pt-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-bold">{s.label}</span>
              <span className="mono-label">{s.shield}</span>
              <span className={cn("font-mono text-[11px] uppercase tracking-widest", s.state === "fail" ? "text-danger-text" : s.state === "pass" ? "text-accent-text" : "text-muted")}>{MARK[s.state].label}</span>
            </div>
            {s.note && <p className="mt-0.5 text-xs text-soft">{s.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
