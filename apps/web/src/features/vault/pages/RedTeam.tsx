import { useEffect, useRef, useState } from "react";
import { AttackScenario, type JobDetailDto } from "@agentshield/shared";
import { useVaultSim } from "@/shared/api/mockChain";
import type { VaultView } from "@/shared/api/vaultSource";
import { Panel } from "@/shared/ui/Panel";
import { Stamp, type StampTone } from "@/shared/ui/Stamp";
import { RedTeamPanel } from "../components/RedTeamPanel";
import { VerdictCard } from "../components/VerdictCard";
import { sectionPath, type VaultRole } from "../guards/access";
import { ATTACK_TITLES, checkOutcome, expectationSentence, type OutcomeCheck } from "../lib/attacks";

const TONE: Record<Exclude<OutcomeCheck["kind"], "pending">, StampTone> = { expected: "ok", "blocked-other": "warn", unexpected: "danger" };

/** The promise for the attack just launched, then whether the job kept it. */
function OutcomeCard({ job, scenario }: { job: JobDetailDto; scenario: AttackScenario }) {
  const check = checkOutcome(job, scenario);
  return (
    <Panel title={`Expected · ${ATTACK_TITLES[scenario]}`} tone={check.kind === "unexpected" ? "danger" : "default"}>
      <p className="text-sm text-soft">{expectationSentence(scenario)}</p>
      <div className="mb-1 mt-3 min-h-10" aria-live="polite">
        {check.kind === "pending" ? (
          <span className="mono-label">Waiting for the verdict…</span>
        ) : (
          <Stamp tone={TONE[check.kind]} animate>
            {check.label}
          </Stamp>
        )}
      </div>
    </Panel>
  );
}

/** Before anything runs: what each button is meant to prove, from the same table the server tests assert. */
function WhatEachTestProves() {
  return (
    <Panel title="What each test proves">
      <ol className="space-y-3">
        {AttackScenario.options.map((s, i) => (
          <li key={s} className="flex gap-3">
            <span className="mono-label w-6 shrink-0 pt-0.5">0{i + 1}</span>
            <span>
              <span className="block font-bold">{ATTACK_TITLES[s]}</span>
              <span className="block text-sm text-soft">{expectationSentence(s)}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-line pt-3 text-sm text-muted">Run one on the left. Its verdict shows up here, step by step, and stays in the activity log.</p>
    </Panel>
  );
}

/**
 * /vaults/:safe/red-team (ui-pages §10.5): the controls on the left, the verdict of the job just started on the
 * right with a link to its job page. Who may press the buttons follows the Overview (owner only on /vaults/*).
 */
export function RedTeam({ view, role }: { view: VaultView; role: VaultRole }) {
  const sim = useVaultSim(view);
  const [last, setLast] = useState<{ id: string; scenario: AttackScenario | null } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  // On phones the result sits below the buttons: bring its top (the expected/actual stamp) into view. On desktop it is
  // already beside the buttons, so nothing moves unless the visitor scrolled past it.
  useEffect(() => {
    const el = resultRef.current;
    if (!last || !el) return;
    const top = el.getBoundingClientRect().top;
    if (top >= 0 && top < window.innerHeight / 2) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
    el.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [last]);

  if (!(view.chain.moduleEnabled && view.chain.policyActive)) {
    return (
      <Panel title="Red team">
        <p className="text-soft">This vault is not set up yet, so there is nothing to attack. The agent cannot trade until setup finishes.</p>
      </Panel>
    );
  }

  const job = last ? sim?.jobs.find((j) => j.id === last.id) : undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <RedTeamPanel view={view} canAct={role === "owner"} onStarted={(id, scenario) => setLast({ id, scenario })} />
      <div ref={resultRef} className="scroll-mt-20 space-y-6">
        {job && last ? (
          <>
            {last.scenario && <OutcomeCard job={job} scenario={last.scenario} />}
            <VerdictCard job={job} detailsTo={`${sectionPath(view.safe, "activity")}/${job.id}`} />
          </>
        ) : (
          <WhatEachTestProves />
        )}
      </div>
    </div>
  );
}
