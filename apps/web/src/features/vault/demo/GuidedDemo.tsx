import { ArrowLeft, ArrowRight, Check, Lock, Play, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { describeApiError } from "@/shared/api/errorCopy";
import { useJobDetail, useJobLauncher, useVaultFeed } from "@/shared/api/vaultFeed";
import type { VaultView } from "@/shared/api/vaultSource";
import { usdcLimit } from "@/shared/api/mockEngine";
import { cn } from "@/shared/lib/cn";
import { formatTokenAmount } from "@/shared/lib/format";
import { useCountdown } from "@/shared/lib/useCountdown";
import { registerBlockedAttack } from "@/shared/mascot/auraEvents";
import { LINES, pick } from "@/shared/mascot/lines";
import { react, visit } from "@/shared/mascot/mascotStore";
import { Chamfer } from "@/shared/ui/Chamfer";
import { primaryCta, secondaryCta } from "@/shared/ui/cta";
import { Panel } from "@/shared/ui/Panel";
import { Skeleton } from "@/shared/ui/Skeleton";
import { SnowtraceLink } from "@/shared/ui/SnowtraceLink";
import { Stamp } from "@/shared/ui/Stamp";
import type { SentTx } from "@/shared/ui/TxButton";
import { BalancesPanel } from "../components/BalancesPanel";
import { BudgetBar } from "../components/BudgetBar";
import { AgentBrainCard } from "../components/AgentBrainCard";
import { ShieldPipeline } from "../components/ShieldPipeline";
import { KillSwitch } from "../components/KillSwitch";
import { useOwnerControl } from "../hooks/useOwnerControl";
import { parseLimit } from "../lib/policyForm";
import { tourProgress } from "../lib/tour";
import { checkTradeAmount, doneSteps, firstOpenStep, GUIDED_STEPS, normalTradeAmount, stepFor, stepResult, TRADE_PRESETS, type GuidedId, type StepResult } from "./guided";

const STEP_GROUND = "guided-step";

/** The steps in a row: number, short name, done tick. Any step can be opened; the next one is marked. */
function StepRail({ current, done, onPick }: { current: number; done: ReadonlySet<GuidedId>; onPick: (i: number) => void }) {
  return (
    <ol aria-label="Steps" className="grid grid-cols-5 border border-line-strong bg-surface">
      {GUIDED_STEPS.map((s, i) => {
        const isDone = done.has(s.id);
        const isCurrent = i === current;
        return (
          <li key={s.id} className="border-r border-line-strong last:border-r-0">
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-current={isCurrent ? "step" : undefined}
              className={cn("flex min-h-14 w-full flex-col items-start gap-1 px-1.5 py-2 text-left sm:flex-row sm:items-center sm:gap-3 sm:px-3", isCurrent ? "bg-ink text-bg" : "hover:bg-hover")}
            >
              <span
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center font-mono text-xs font-bold",
                  isDone ? "bg-accent text-on-accent" : isCurrent ? "border border-bg" : "border border-line-strong",
                )}
              >
                {isDone ? <Check aria-hidden strokeWidth={3} className="size-4" /> : `0${i + 1}`}
              </span>
              <span className="text-[11px] font-bold leading-tight sm:text-sm">{s.short}</span>
              <span className="sr-only">{isDone ? "(done)" : ""}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** The verdict of the step's job, in plain words, with every check behind a toggle and the public proof link. */
function ResultBlock({ result, job, brain }: { result: StepResult; job: Parameters<typeof ShieldPipeline>[0]["job"] | undefined; brain: boolean }) {
  if (result.kind === "idle" || !job) return null;
  // The hijack step: first what the fooled AI decided, then the shields that judged it.
  const thinking = brain && <AgentBrainCard plan={job.agentPlan} />;
  if (result.kind === "running") {
    return (
      <div className="space-y-3 border border-line-strong bg-bg p-4">
        <p className="mono-label">{brain && !job.agentPlan ? "The AI is reading the fake message" : "Checking it now, step by step"}</p>
        {thinking}
        {(!brain || job.agentPlan) && <ShieldPipeline job={job} />}
      </div>
    );
  }
  const blocked = result.kind === "pass" && result.tone === "danger";
  return (
    <div className={cn("border-l-4 p-4", result.kind === "other" ? "border-warn bg-tint-amber" : blocked ? "border-danger bg-tint-pink" : "border-accent bg-bg")}>
      <div className="flex flex-wrap items-center gap-3">
        {result.kind === "pass" ? (
          <Stamp tone={result.tone} animate>
            {result.stamp}
          </Stamp>
        ) : (
          <Stamp tone="warn" animate>
            Unexpected
          </Stamp>
        )}
        <p className="text-lg font-bold leading-tight">{result.headline}</p>
      </div>
      <p className="mt-2 text-soft">{result.detail}</p>
      {thinking && <div className="mt-3">{thinking}</div>}
      {job.txHash && (
        <p className="mt-3">
          <SnowtraceLink kind="tx" value={job.txHash}>{job.status === "reverted" ? "See the failed transaction" : "See it on Snowtrace"}</SnowtraceLink>
        </p>
      )}
      {/* Every check, with the numbers it compared: the point of the demo is to see why. */}
      <div className="mt-3 border-t border-line pt-3">
        <ShieldPipeline job={job} />
      </div>
    </div>
  );
}

/**
 * How much the normal trade moves: 20 USDC by default, the visitor may pick 1 to 100 (the shared vault's daily limit
 * belongs to everyone). Presets for one tap; the error sits under the field and keeps the button off.
 */
function TradeAmount({ text, onChange, error, disabled }: { text: string; onChange: (v: string) => void; error: string | null; disabled: boolean }) {
  return (
    <div className="mb-4">
      <label htmlFor="guided-amount" className="mono-label">
        USDC to swap
      </label>
      <div className="mt-1 flex flex-wrap items-stretch gap-2">
        <div className="flex items-stretch">
          <input
            id="guided-amount"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={!!error}
            aria-describedby="guided-amount-help"
            className={cn("tabular min-h-11 w-28 border bg-surface px-3 font-mono text-base disabled:opacity-50", error ? "border-danger" : "border-line-strong")}
          />
          <span className="inline-flex items-center border border-l-0 border-line-strong bg-hover px-3 font-mono text-xs text-soft">USDC</span>
        </div>
        {TRADE_PRESETS.map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            aria-pressed={text.trim() === v}
            onClick={() => onChange(v)}
            className={cn("tabular min-h-11 min-w-11 border px-3 font-mono text-sm disabled:opacity-50", text.trim() === v ? "border-fg bg-ink text-bg" : "border-line-strong hover:bg-hover")}
          >
            {v}
          </button>
        ))}
      </div>
      <p id="guided-amount-help" className={cn("mt-1.5 text-sm", error ? "font-bold text-danger-text" : "text-muted")}>
        {error ?? "1 to 100 USDC. This vault is shared, so its daily limit belongs to everyone."}
      </p>
    </div>
  );
}

/** "Cooling down" on the shared vault: someone else just pressed, so it is a wait, not an error. */
const isCooldown = (e: unknown) => e instanceof ApiError && (e.code === "COOLDOWN" || e.code === "RATE_LIMITED");

/**
 * /demo Guided mode: one step at a time, the button inside the step and the result right under it, in words a
 * newcomer understands. The vault on the side updates live (chain-sourced), so every press visibly changes something.
 */
export function GuidedDemo({ view, onFreePlay }: { view: VaultView; onFreePlay: () => void }) {
  const feed = useVaultFeed(view);
  const control = useOwnerControl(view, { role: "anonymous", sandbox: true });
  const { launch } = useJobLauncher(view);
  const visitStart = useRef(Date.now());
  const [killed, setKilled] = useState(false);
  const [runs, setRuns] = useState<Partial<Record<GuidedId, string>>>({});
  const [passed, setPassed] = useState<ReadonlySet<GuidedId>>(new Set());
  const [current, setCurrent] = useState(0);
  const [finale, setFinale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; cooldown: boolean } | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const wait = useCountdown(waitUntil);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  // The normal trade's amount: what the visitor typed, else today's default (20 USDC, less if the vault is nearly spent).
  const [amountText, setAmountText] = useState<string | null>(null);
  const tradeText = amountText ?? formatTokenAmount(normalTradeAmount(feed.state), 6);
  const tradeCheck = checkTradeAmount(tradeText, feed.state);
  const tradeError = "error" in tradeCheck ? tradeCheck.error : null;
  // The story follows what is typed (even an amount the button refuses), so the sentence and the field never disagree.
  const typed = parseLimit(tradeText, 6);
  const step = stepFor(GUIDED_STEPS[current]!, feed.state, "value" in typed ? typed.value : undefined);
  const jobId = runs[step.id];
  const { job } = useJobDetail(view, jobId);
  const result = stepResult(step.id, job);

  const jobsReady = feed.jobsStatus === "ready";
  const tour = useMemo(() => (jobsReady ? tourProgress(feed.jobs, view.safe, visitStart.current, killed) : null), [jobsReady, feed.jobs, view.safe, killed]);
  const done = doneSteps(tour, passed);
  const allDone = GUIDED_STEPS.every((s) => done.has(s.id));
  const state = feed.state;
  const isActive = control.isActive ?? state?.isActive;
  // The public sandbox: the simulation lets anyone "sign" the Kill-Switch; the live demo vault is shared, so a guest
  // never locks it for everyone (only its owner could, and the guide does not offer it).
  const canKill = feed.source === "mock" && control.canSign;
  const lowGas = view.agentGas === "low";

  // A step that ended as promised is done, and Aura-kun reacts on the card where it happened.
  const resultKey = jobId && result.kind !== "idle" && result.kind !== "running" ? `${jobId}:${result.kind}` : null;
  useEffect(() => {
    if (!resultKey || result.kind === "idle" || result.kind === "running") return;
    if (result.kind === "pass") {
      setPassed((p) => new Set(p).add(step.id));
      visit(STEP_GROUND);
      if (result.tone === "ok") react("happy", { text: pick(LINES.approve), hold: 1400 });
      else {
        react("guard", { text: pick(LINES.blocked), hold: 1600 });
        registerBlockedAttack();
      }
    }
    // Phones: bring the verdict into view when it lands below the fold.
    const el = resultRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.75) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
      el.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" });
    }
    // Only when a new verdict arrives.
  }, [resultKey]);

  // Moving between steps puts the keyboard and screen reader on the new step's title.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [current]);
  const go = (i: number) => {
    moved.current = true;
    setError(null);
    setFinale(false);
    setCurrent(Math.max(0, Math.min(GUIDED_STEPS.length - 1, i)));
  };

  const run = async () => {
    if (!step.spec || busy || (step.id === "rebalance" && tradeError)) return;
    setBusy(true);
    setError(null);
    try {
      const id = await launch(step.spec);
      setRuns((r) => ({ ...r, [step.id]: id }));
      setWaitUntil(null);
    } catch (e) {
      const copy = describeApiError(e);
      const cooldown = isCooldown(e);
      setError({ message: cooldown ? "Someone else just ran a test on this shared vault." : copy.message, cooldown });
      setWaitUntil(copy.retryAfterSec ? Date.now() + copy.retryAfterSec * 1000 : null);
    } finally {
      setBusy(false);
    }
  };

  const running = result.kind === "running" || busy;
  const finished = result.kind === "pass" || result.kind === "other" || (step.id === "kill" && done.has("kill"));
  const isLast = current === GUIDED_STEPS.length - 1;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <StepRail current={current} done={done} onPick={go} />

        {finale && allDone ? (
          <Finale onFreePlay={onFreePlay} onRestart={() => go(0)} />
        ) : (
          <Chamfer code={`STEP 0${current + 1} / 0${GUIDED_STEPS.length}`} ground={STEP_GROUND} innerClassName="p-5 pb-10 sm:p-7 sm:pb-12">
            <span className="mono-label">
              Step {current + 1} of {GUIDED_STEPS.length}
            </span>
            <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl leading-tight outline-none sm:text-3xl">
              {step.title}
            </h2>
            <p className="mt-3 text-lg text-soft">{step.story}</p>
            <p className="mt-4 flex gap-2 border border-line bg-bg px-3 py-2 text-sm">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-text" />
              <span>
                <span className="mono-label mr-2">What should happen</span>
                {step.expect}
              </span>
            </p>

            <div className="mt-6">
              {step.id === "rebalance" && <TradeAmount text={tradeText} onChange={setAmountText} error={tradeError} disabled={running} />}
              {step.spec ? (
                <div className="flex flex-wrap items-center gap-4">
                  <span className={cn(!finished && "drop-hard")}>
                    {/* Once there is a result, "Next step" becomes the main action and this one steps back. */}
                    <button type="button" onClick={() => void run()} disabled={running || wait > 0 || lowGas || (step.id === "rebalance" && !!tradeError)} className={cn(finished ? secondaryCta : primaryCta, "gap-2 disabled:cursor-not-allowed disabled:opacity-50")}>
                      <Play aria-hidden className="size-4" />
                      {busy ? "Sending…" : result.kind === "running" ? "Checking…" : wait > 0 ? `Your turn in ${wait}s` : finished ? "Run it again" : step.cta}
                    </button>
                  </span>
                  {feed.source === "live" && <span className="mono-label">Runs on Avalanche Fuji · test money</span>}
                </div>
              ) : (
                <KillStep canKill={canKill} isActive={isActive} send={control.revoke} done={done.has("kill")} onDone={() => setKilled(true)} />
              )}
              {lowGas && <p role="alert" className="mt-3 border-l-4 border-warn bg-tint-amber px-3 py-2 text-sm">The agent is low on gas, so new tests are paused for a moment.</p>}
              {error && (
                <p role="alert" className={cn("mt-3 border-l-4 px-3 py-2 text-sm", error.cooldown ? "border-warn bg-tint-amber" : "border-danger bg-tint-pink")}>
                  {error.message}
                  {wait > 0 && <span className="tabular ml-1 font-mono font-bold">Your turn in {wait}s.</span>}
                </p>
              )}
            </div>

            <div ref={resultRef} aria-live="polite" className="mt-5">
              <ResultBlock key={jobId ?? "none"} result={result} job={job} brain={step.id === "hijack"} />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <button type="button" onClick={() => go(current - 1)} disabled={current === 0} className="inline-flex min-h-10 items-center gap-2 px-1 text-sm font-bold text-soft hover:text-fg disabled:invisible">
                <ArrowLeft aria-hidden className="size-4" /> Back
              </button>
              {isLast ? (
                done.has("kill") && (
                  <span className="drop-hard">
                    <button type="button" onClick={() => (allDone ? setFinale(true) : go(firstOpenStep(done)))} className={cn(primaryCta, "h-11 gap-2 px-5 text-sm")}>
                      {allDone ? "See your results" : "Finish the skipped steps"} <ArrowRight aria-hidden className="size-4" />
                    </button>
                  </span>
                )
              ) : finished ? (
                <span className="drop-hard">
                  <button type="button" onClick={() => go(current + 1)} className={cn(primaryCta, "h-11 gap-2 px-5 text-sm")}>
                    Next step <ArrowRight aria-hidden className="size-4" />
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => go(current + 1)} className="inline-flex min-h-10 items-center gap-1 text-sm font-bold text-muted hover:text-fg">
                  Skip this step <ArrowRight aria-hidden className="size-4" />
                </button>
              )}
            </div>
          </Chamfer>
        )}
      </div>

      {/* The vault itself, read from the chain: every press above visibly changes something here. */}
      <aside aria-label="The vault right now" className="space-y-6">
        {state ? (
          <>
            <AgentRules state={state} isActive={isActive} />
            <BudgetBar state={state} />
            <BalancesPanel state={state} lastChange={feed.lastChange} />
          </>
        ) : (
          <>
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        )}
      </aside>
    </div>
  );
}

/** The rules the contract enforces on this vault, as four plain sentences, from the chain-sourced policy. */
function AgentRules({ state, isActive }: { state: NonNullable<ReturnType<typeof useVaultFeed>["state"]>; isActive: boolean | undefined }) {
  const { maxPerTx, dailyCap } = usdcLimit(state);
  const rules = [
    `At most ${formatTokenAmount(maxPerTx, 6)} USDC per trade`,
    `At most ${formatTokenAmount(dailyCap, 6)} USDC per day`,
    "Money can only come back to this vault",
    "The owner can lock it out at any time",
  ];
  return (
    <Panel title="The agent's rules" aside={<span className={cn("mono-label", isActive === false ? "text-danger-text" : "text-accent-text")}>{isActive === false ? "Locked" : "Enforced on-chain"}</span>}>
      <ul className="space-y-2">
        {rules.map((r) => (
          <li key={r} className="flex gap-2 text-sm">
            <Check aria-hidden strokeWidth={3} className="mt-0.5 size-4 shrink-0 text-accent-text" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line pt-3 text-xs text-muted">Written into a smart contract on the blockchain. Not even our server can change them.</p>
    </Panel>
  );
}

/**
 * Step 4. The simulation: the real hold-to-confirm Kill-Switch. The live demo vault is shared by every visitor, so
 * there the guide explains what the owner would do instead of offering a button that is off for guests.
 */
function KillStep({ canKill, isActive, send, done, onDone }: { canKill: boolean; isActive: boolean | undefined; send: () => Promise<SentTx>; done: boolean; onDone: () => void }) {
  if (canKill && isActive !== false) {
    return (
      <div className="max-w-md">
        <KillSwitch isActive send={send} onKilled={onDone} />
      </div>
    );
  }
  if (canKill) {
    return (
      <p className="flex items-center gap-3 border-l-4 border-danger bg-tint-pink px-3 py-3">
        <Stamp tone="danger">Locked</Stamp>
        <span className="text-sm">The agent is locked out. Try step 1 again: the contract now refuses every trade.</span>
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="hazard p-1.5">
        <div className="flex flex-wrap items-center gap-3 bg-bg px-4 py-3">
          <Lock aria-hidden className="size-5 shrink-0 text-danger-text" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-bold">Only the owner&apos;s wallet can press this.</span> This demo vault is shared by every visitor, so the button is
            off here. On your own vault you hold it for a second, sign once, and the agent is locked out within seconds.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {done ? (
          <Stamp tone="ok">Got it</Stamp>
        ) : (
          <span className="drop-hard">
            <button type="button" onClick={onDone} className={cn(primaryCta, "h-11 px-5 text-sm")}>
              Got it
            </button>
          </span>
        )}
        <Link to="/vaults/new" className="text-sm font-bold text-accent-text underline underline-offset-4">
          Create your own vault to try it
        </Link>
      </div>
    </div>
  );
}

/** Every step done: the summary, then where to go next. */
function Finale({ onFreePlay, onRestart }: { onFreePlay: () => void; onRestart: () => void }) {
  return (
    <Chamfer code={`RESULT / 0${GUIDED_STEPS.length} OF 0${GUIDED_STEPS.length}`} ground={STEP_GROUND} edge="bg-accent" innerClassName="p-5 pb-10 sm:p-7 sm:pb-12">
      <Stamp tone="ok" animate>
        Held
      </Stamp>
      <h2 className="mt-4 text-3xl font-black uppercase italic leading-[0.95] tracking-[-0.03em] sm:text-4xl">
        You tried to break it.
        <span className="outline-text block">It held.</span>
      </h2>
      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {[
          ["Normal trade", "went through"],
          ["Taking too much", "stopped before signing"],
          ["Fooling the AI", "its plan was refused"],
          ["Hacking around the website", "stopped by the contract"],
          ["Emergency stop", "one signature, agent locked"],
        ].map(([what, how]) => (
          <li key={what} className="flex gap-2 border border-line bg-bg px-3 py-2 text-sm">
            <Check aria-hidden strokeWidth={3} className="mt-0.5 size-4 shrink-0 text-accent-text" />
            <span>
              <span className="font-bold">{what}</span> <span className="text-soft">{how}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-soft">Even a fooled AI never had a way to take the money. It trades all day, inside your rules. That is the whole idea.</p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <span className="drop-hard">
          <Link to="/vaults/new" className={primaryCta}>Create your own vault</Link>
        </span>
        <button type="button" onClick={onFreePlay} className={secondaryCta}>
          Free play: more attacks
        </button>
        <button type="button" onClick={onRestart} className="min-h-10 text-sm font-bold text-soft underline underline-offset-4 hover:text-fg">
          Start over
        </button>
      </div>
    </Chamfer>
  );
}
