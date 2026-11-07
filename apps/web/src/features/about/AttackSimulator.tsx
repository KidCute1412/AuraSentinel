import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, FileCheck2, Landmark, ShieldCheck, type LucideIcon } from "lucide-react";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";
import { cn } from "@/shared/lib/cn";
import { useReducedMotion } from "@/shared/lib/useReducedMotion";
import { LINES, pick } from "@/shared/mascot/lines";
import { registerBlockedAttack } from "@/shared/mascot/auraEvents";
import { react } from "@/shared/mascot/mascotStore";
import { primaryCta } from "@/features/landing/cta";
import { NODES, route, SCENARIOS, scenarioById, type NodeId, type ScenarioId } from "./attackScenarios";

const STEP_MS = 450;

const NODE_UI: Record<NodeId, { icon: LucideIcon; label: string; sub: string }> = {
  agent: { icon: Bot, label: "Agent", sub: "session key" },
  shield1: { icon: ShieldCheck, label: "Auditor", sub: "off-chain" },
  shield2: { icon: FileCheck2, label: "Policy", sub: "on-chain" },
  vault: { icon: Landmark, label: "Vault", sub: "your Safe" },
};

interface Run { step: number; done: boolean }

/** Pick an attack, press Run, watch which shield stops it. Pure illustration: nothing is sent anywhere. */
export function AttackSimulator() {
  const reduced = useReducedMotion();
  const [sel, setSel] = useState<ScenarioId>("drain");
  const [run, setRun] = useState<Run | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const result = useMemo(() => route(scenarioById(sel)), [sel]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const choose = (id: ScenarioId) => {
    clearTimers();
    setRun(null);
    setSel(id);
  };

  const finish = () => {
    setRun({ step: result.path.length - 1, done: true });
    if (result.verdict === "blocked") {
      react("alarm", { text: pick(LINES.blocked), hold: 1100 });
      registerBlockedAttack();
    }
    else react("happy", { text: pick(LINES.approve), hold: 1100 });
  };

  const play = () => {
    clearTimers();
    if (reduced) {
      finish();
      return;
    }
    setRun({ step: 0, done: false });
    result.path.forEach((_, i) => {
      if (i > 0) timers.current.push(setTimeout(() => setRun({ step: i, done: false }), i * STEP_MS));
    });
    timers.current.push(setTimeout(finish, (result.path.length - 1) * STEP_MS + 350));
  };

  const playing = run !== null && !run.done;
  const stopIdx = NODES.indexOf(result.stopsAt);
  const blocked = result.verdict === "blocked";

  return (
    <Chamfer ground="sim-card" code="SIM / ATTACK" innerClassName="p-5 pb-10 sm:p-8 sm:pb-12">
      <fieldset disabled={playing}>
        <legend className="mono-label">1 · choose an attack</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SCENARIOS.map((s) => (
            <label
              key={s.id}
              className={cn(
                "block cursor-pointer border border-line-strong p-3 transition-colors duration-150 hover:bg-hover",
                "has-[:checked]:border-accent has-[:checked]:bg-tint-mint has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-highlight",
                playing && "cursor-not-allowed opacity-60",
              )}
            >
              <input type="radio" name="attack" value={s.id} checked={sel === s.id} onChange={() => choose(s.id)} className="sr-only" />
              <span className="block font-bold">{s.label}</span>
              <span className="mono-label mt-1 block normal-case tracking-normal">{s.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-8">
        <span className="mono-label">2 · watch it travel</span>
        <div className="relative mt-3">
          <div aria-hidden className="absolute inset-x-[12.5%] top-[2.1rem] border-t-2 border-dashed border-line-strong" />
          {run && (
            <span
              aria-hidden
              className={cn(
                "absolute top-[calc(2.1rem-0.4rem)] z-10 size-3 -translate-x-1/2 transition-[left,opacity] duration-[400ms] ease-out motion-reduce:transition-none",
                run.done && blocked ? "bg-danger opacity-0" : "bg-accent",
              )}
              style={{ left: `${12.5 + run.step * 25}%` }}
            />
          )}
          <ol className="grid grid-cols-4 gap-2 sm:gap-4">
            {NODES.map((id, i) => {
              const { icon: Icon, label, sub } = NODE_UI[id];
              const reached = run !== null && i <= run.step;
              const isStop = run?.done === true && i === stopIdx;
              const skipped = run?.done === true && result.skipped.includes(id);
              return (
                <li key={id}>
                  <Chamfer
                    edge={isStop ? (blocked ? "bg-danger" : "bg-accent") : reached ? "bg-accent" : "bg-line-strong"}
                    fill={isStop && blocked ? "bg-tint-pink" : reached ? "bg-tint-mint" : "bg-surface"}
                    innerClassName="flex min-h-[6.5rem] flex-col items-center px-1 pb-3 pt-4 text-center sm:px-3"
                  >
                    <Icon aria-hidden className={cn("size-7", isStop && blocked ? "text-danger-text" : reached ? "text-accent-text" : "text-muted")} />
                    <span className="mt-2 text-sm font-bold">{label}</span>
                    <span className="mono-label mt-0.5 text-[10px]">{skipped ? "bypassed" : sub}</span>
                  </Chamfer>
                  <div className="mt-3 flex min-h-8 justify-center">
                    {isStop && <Stamp tone={blocked ? "danger" : "ok"} animate>{blocked ? "Blocked" : "Approved"}</Stamp>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <span className="drop-hard">
          <button type="button" onClick={play} disabled={playing} className={cn(primaryCta, "disabled:pointer-events-none disabled:opacity-50")}>
            {run?.done ? "Run again" : playing ? "Running…" : "Run attack"}
          </button>
        </span>
        <span className="mono-label">illustration only · nothing is sent</span>
      </div>

      <div aria-live="polite" className="mt-6 min-h-[6.5rem] border-t border-line pt-5">
        {run?.done ? (
          <div className="animate-feed-in">
            <div className="flex flex-wrap items-center gap-3">
              <code className={cn("font-mono text-sm font-bold", blocked ? "text-danger-text" : "text-accent-text")}>{result.code}</code>
              <span className="mono-label">decided by {result.decidedBy}</span>
            </div>
            <p className="mt-2 max-w-2xl text-soft">{result.explanation}</p>
          </div>
        ) : (
          <p className="text-soft">{playing ? "Following the transaction…" : "Pick an attack, then press Run. The result appears here."}</p>
        )}
      </div>
    </Chamfer>
  );
}
