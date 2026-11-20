import { Swords } from "lucide-react";
import type { CreateAutoRedTeamResponse, JobDto } from "@agentshield/shared";
import { useVaultFeed } from "@/shared/api/vaultFeed";
import type { VaultView } from "@/shared/api/vaultSource";
import { cn } from "@/shared/lib/cn";
import { Stamp } from "@/shared/ui/Stamp";
import { autoScore, runOutcome } from "../lib/autoRedTeam";

const TONE = {
  blocked: "border-accent text-accent-text",
  held: "border-accent border-dashed text-accent-text",
  through: "border-danger bg-danger text-bg",
  running: "border-line-strong text-muted",
  error: "border-warn text-warn",
} as const;

/**
 * Auto red-team: the attacker model's five prompts, each a Hijacked Agent run, with the verdict of each and the one
 * number that matters, how many got money out. Statuses come from the vault's job feed (SSE live, the store in the
 * simulation), so the board updates on its own. A row opens that run's verdict.
 */
export function AutoRedTeamBoard({ view, run, selectedId, onPick }: { view: VaultView; run: CreateAutoRedTeamResponse; selectedId?: string; onPick: (jobId: string) => void }) {
  const feed = useVaultFeed(view);
  const byId = new Map<string, JobDto>(feed.jobs.map((j) => [j.id, j]));
  const rows = run.jobs.map((r) => ({ ...r, job: byId.get(r.jobId) }));
  const score = autoScore(rows.map((r) => r.job));

  return (
    <section aria-label="Auto red-team results" className="border border-line-strong bg-bg">
      <header className="border-b border-line px-3 py-2">
        <span className="inline-flex items-center gap-2">
          <Swords aria-hidden className="size-4 shrink-0" />
          <span className="mono-label">Auto red-team · {run.source === "llm" ? "attacks written by an AI" : "preset attacks"}</span>
        </span>
        {/* Its own row with room around it: the stamp is tilted, it must not touch the label or the border. */}
        <div aria-live="polite" className="mt-1 flex min-h-11 items-center px-1">
          {score.done ? (
            <Stamp tone={score.through === 0 ? "ok" : "danger"} animate>
              {`${score.through} / ${score.total} got funds out`}
            </Stamp>
          ) : (
            <span className="tabular font-mono text-xs font-bold uppercase tracking-widest text-soft">
              Running {score.finished} / {score.total}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted">Pick a run to see what the AI planned and which shield stopped it.</p>
      </header>
      <ol className="divide-y divide-line">
        {rows.map((r, i) => {
          const o = runOutcome(r.job);
          const on = r.jobId === selectedId;
          return (
            <li key={r.jobId}>
              <button
                type="button"
                onClick={() => onPick(r.jobId)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-l-4 px-3 py-2.5 text-left sm:grid-cols-[auto_minmax(0,1fr)_auto]",
                  on ? "border-fg bg-hover" : "border-transparent hover:bg-hover",
                )}
              >
                <span className="mono-label pt-0.5">0{i + 1}</span>
                <span className="min-w-0">
                  <span className="line-clamp-1 break-all text-sm" title={r.text}>{r.text}</span>
                  <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-widest text-muted">
                    {r.job?.agentPlan ? `AI plan: ${r.job.agentPlan.action.type}` : "AI is reading…"}
                    {on && <span className="ml-2 font-bold text-fg">· Viewing</span>}
                  </span>
                </span>
                <span className={cn("col-start-2 justify-self-start border px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest sm:col-start-auto sm:self-center", TONE[o.tone])}>
                  {o.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
