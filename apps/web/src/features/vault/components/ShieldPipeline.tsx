import { useRef, useState, type KeyboardEvent } from "react";
import { Ban, Check, Circle, Minus, X } from "lucide-react";
import { fromAmount, type CheckRow, type JobDetailDto } from "@agentshield/shared";
import { reasonTitle } from "@/shared/api/mockEngine";
import { cn } from "@/shared/lib/cn";
import { formatTokenAmount } from "@/shared/lib/format";
import { jobLabel } from "@/shared/lib/jobLabel";
import { clockTime } from "@/shared/lib/time";
import { SnowtraceLink } from "@/shared/ui/SnowtraceLink";
import { dailyBar, formatValue, GATE_INFO, ruleLabel, ruleOp } from "../lib/checks";
import { moneyFlow } from "../lib/moneyFlow";
import type { GateLook } from "../lib/pipelineMotion";
import { timelineSteps, type StepId, type TimelineStep } from "../lib/timeline";
import { MoneyFlowDiagram } from "./MoneyFlowDiagram";
import { PipelineTrack } from "./PipelineTrack";

type GateState = GateLook;

const GATE: Record<GateState, { word: string; box: string; bar: string; icon: typeof Check }> = {
  pass: { word: "Passed", box: "border-accent", bar: "bg-accent", icon: Check },
  fail: { word: "Stopped here", box: "border-danger bg-tint-pink", bar: "bg-danger", icon: X },
  active: { word: "Checking…", box: "border-fg animate-pulse motion-reduce:animate-none", bar: "bg-line-strong", icon: Circle },
  pending: { word: "Waiting", box: "border-line", bar: "bg-line", icon: Circle },
  skipped: { word: "Not reached", box: "border-line border-dashed", bar: "bg-line", icon: Minus },
  bypassed: { word: "Bypassed", box: "border-line-strong border-dashed bg-hover", bar: "bg-line", icon: Ban },
};

interface Gate extends TimelineStep {
  look: GateState;
  checks: CheckRow[];
}

function gatesOf(job: JobDetailDto): Gate[] {
  const bypassed = job.origin === "redteam" && job.precheck === null && job.audit.some((a) => a.shield === "onchain");
  return timelineSteps(job).map((s) => ({
    ...s,
    look: bypassed && s.shield === "Shield 1" ? "bypassed" : s.state,
    checks: job.audit.find((a) => a.shield === s.id)?.checks ?? [],
  }));
}

/** The packet's tag on the track: the amount, else what the job was. */
const packetLabel = (job: JobDetailDto): string =>
  job.intent && job.intent.amountIn !== "0" ? `${formatTokenAmount(fromAmount(job.intent.amountIn), 6)} USDC` : job.kind === "attack" ? "Attack" : "Trade";

/** Where to look first: the gate that stopped it, else the furthest gate that ran. */
function defaultGate(gates: Gate[]): StepId {
  return (gates.find((g) => g.look === "fail") ?? [...gates].reverse().find((g) => g.look === "pass" || g.look === "active") ?? gates[0]!).id;
}

/** Bar width in percent (display only, from bigint). */
const pct = (part: bigint, whole: bigint) => (whole > 0n ? Math.min(100, Number((part * 10_000n) / whole) / 100) : 0);

function DailyBar({ bar }: { bar: NonNullable<ReturnType<typeof dailyBar>> }) {
  const over = bar.spent + bar.trade > bar.cap;
  const fmt = (v: bigint) => formatTokenAmount(v, bar.decimals);
  return (
    <div className="mt-2">
      <div aria-hidden className="flex h-2.5 w-full overflow-hidden border border-line-strong bg-bg">
        <span className="h-full bg-line-strong" style={{ width: `${pct(bar.spent, bar.cap)}%` }} />
        <span className={cn("h-full", over ? "bg-danger" : "bg-accent")} style={{ width: `${Math.min(100 - pct(bar.spent, bar.cap), pct(bar.trade, bar.cap))}%` }} />
      </div>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted">
        {fmt(bar.spent)} spent + {fmt(bar.trade)} this trade / {fmt(bar.cap)} {bar.symbol} cap
      </p>
    </div>
  );
}

/** Rules print one after another, like a terminal log (60ms apart, each a 200ms slide-in). */
const RULE_STAGGER_MS = 60;

function RuleRow({ row, amountIn, index }: { row: CheckRow; amountIn: string | undefined; index: number }) {
  const op = ruleOp(row.id);
  const bar = dailyBar(row, amountIn);
  const txHash = row.id === "tx-sent" && row.actual?.type === "text" ? row.actual.value : null;
  return (
    <li
      className={cn("animate-feed-in grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)]", !row.pass && "bg-tint-pink")}
      style={{ animationDelay: `${index * RULE_STAGGER_MS}ms` }}
    >
      <span className={cn("mt-0.5 inline-flex w-14 items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-widest", row.pass ? "text-accent-text" : "text-danger-text")}>
        {row.pass ? <Check aria-hidden strokeWidth={3} className="size-3.5" /> : <X aria-hidden strokeWidth={3} className="size-3.5" />}
        {row.pass ? "Pass" : "Fail"}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{ruleLabel(row.id)}</span>
        {row.reasonCode && (
          <span className="mt-0.5 block text-xs">
            <code className="font-mono font-bold text-danger-text">{row.reasonCode}</code>
            {reasonTitle(row.reasonCode) !== row.reasonCode && <span className="text-soft"> · {reasonTitle(row.reasonCode)}</span>}
          </span>
        )}
        {bar && <DailyBar bar={bar} />}
      </span>
      <span className="col-start-2 min-w-0 break-words font-mono text-sm tabular sm:col-start-auto sm:text-right">
        {txHash ? (
          <SnowtraceLink kind="tx" value={txHash}>{`${txHash.slice(0, 10)}…`}</SnowtraceLink>
        ) : (
          <>
            <span className={cn(!row.pass && "font-bold text-danger-text")}>{formatValue(row.actual)}</span>
            {row.limit && (
              <span className="text-soft">
                {" "}
                {op ? `${op} ` : ""}
                {formatValue(row.limit)}
              </span>
            )}
          </>
        )}
      </span>
    </li>
  );
}

/** Why a gate shows no table: never invent numbers. */
function emptyText(g: Gate, job: JobDetailDto): string {
  if (g.look === "bypassed") return "The attacker sent the transaction straight to the blockchain, so the website's checks never saw it. Shield 2 is what has to stop it.";
  if (g.look === "skipped") return job.status === "failed" ? "This step did not run: something on our side failed first. No funds moved." : "This step did not run: an earlier shield already stopped the trade.";
  if (g.look === "pending") return "Waiting for the earlier steps.";
  if (g.look === "active") return "Checking this now…";
  return g.note ?? (g.look === "pass" ? "Passed." : "Stopped here.");
}

function GateDetail({ gate, job, showTime }: { gate: Gate; job: JobDetailDto; showTime?: boolean }) {
  const info = GATE_INFO[gate.id];
  const failed = gate.checks.filter((c) => !c.pass).length;
  const flow = moneyFlow(gate.id, gate.checks);
  return (
    <div className={cn("border border-line bg-bg", gate.look === "fail" && "border-danger")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
        <p className="font-mono text-xs font-bold uppercase tracking-widest">
          {info.title} <span className="font-normal text-muted">· {info.where}</span>
        </p>
        <p className="font-mono text-[11px] uppercase tracking-widest text-soft">
          {gate.checks.length > 0 && `${gate.checks.length} rule${gate.checks.length === 1 ? "" : "s"} · ${failed} failed`}
        </p>
        {showTime && gate.ts && (
          <time dateTime={gate.ts} className="tabular font-mono text-[11px] text-muted">
            {clockTime(gate.ts)}
          </time>
        )}
      </div>
      <p className="px-4 pt-2.5 text-sm text-soft">{info.what}</p>
      {flow && <MoneyFlowDiagram flow={flow} />}
      {gate.checks.length > 0 ? (
        <ul className="mt-2 divide-y divide-line border-t border-line">
          {gate.checks.map((c, i) => (
            <RuleRow key={`${c.id}-${i}`} row={c} amountIn={job.intent?.amountIn} index={i} />
          ))}
        </ul>
      ) : (
        <p className="px-4 pb-3 pt-1.5 text-sm">{emptyText(gate, job)}</p>
      )}
    </div>
  );
}

/**
 * The four gates every trade passes, with the evidence behind each verdict (design-system §4 "Shield pipeline").
 * The rail shows how far the trade got; selecting a gate shows the rules it checked: what the trade had against what
 * the rule allows. "full" lists every gate (job page). Text and icon on every state, never color alone.
 */
export function ShieldPipeline({ job, variant = "compact" }: { job: JobDetailDto; variant?: "compact" | "full" }) {
  const gates = gatesOf(job);
  const [picked, setPicked] = useState<StepId | null>(null);
  const selected = picked ?? defaultGate(gates);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const full = variant === "full";

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : gates.length - 1)) % gates.length;
    setPicked(gates[next]!.id);
    tabs.current[next]?.focus();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="border border-line-strong bg-bg px-2 py-1 font-mono text-xs font-bold">{jobLabel(job)}</span>
        <span className="mono-label">Shield 1: our server · Shield 2: the contract</span>
      </div>

      {/* The trade walks the gates toward the vault, so how far it got reads at a glance. */}
      <PipelineTrack ids={gates.map((g) => g.id)} looks={gates.map((g) => g.look)} label={packetLabel(job)} jobFailed={job.status === "failed"} />

      <div role={full ? undefined : "tablist"} aria-label={full ? undefined : "Checks by shield"} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {gates.map((g, i) => {
          const look = GATE[g.look];
          const Icon = look.icon;
          const on = !full && g.id === selected;
          const failed = g.checks.filter((c) => !c.pass).length;
          const content = (
            <>
              <span className="flex items-center justify-between gap-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{g.shield}</span>
                <Icon aria-hidden strokeWidth={3} className={cn("size-3.5", g.look === "pass" ? "text-accent-text" : g.look === "fail" ? "text-danger-text" : "text-muted")} />
              </span>
              <span className="mt-1 block text-sm font-bold leading-tight">{GATE_INFO[g.id].title}</span>
              <span className={cn("mt-0.5 block font-mono text-[11px] uppercase tracking-widest", g.look === "fail" ? "text-danger-text" : g.look === "pass" ? "text-accent-text" : "text-muted")}>
                {look.word}
                {g.checks.length > 0 && g.look !== "fail" && ` · ${g.checks.length}`}
                {failed > 0 && ` · ${failed} rule${failed === 1 ? "" : "s"}`}
              </span>
            </>
          );
          const box = cn("min-h-[4.5rem] border-2 px-2.5 py-2 text-left", look.box, on && "outline outline-2 outline-offset-2 outline-fg");
          return full ? (
            <div key={g.id} className={box}>
              {content}
            </div>
          ) : (
            <button
              key={g.id}
              ref={(el) => void (tabs.current[i] = el)}
              type="button"
              role="tab"
              id={`gate-${job.id}-${g.id}`}
              aria-selected={on}
              aria-controls={`gate-panel-${job.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setPicked(g.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(box, "hover:bg-hover")}
            >
              {content}
            </button>
          );
        })}
      </div>

      {full ? (
        <div className="space-y-3">
          {gates.map((g) => (
            <GateDetail key={g.id} gate={g} job={job} showTime />
          ))}
        </div>
      ) : (
        <div role="tabpanel" id={`gate-panel-${job.id}`} aria-labelledby={`gate-${job.id}-${selected}`}>
          {/* Keyed by gate: switching tabs mounts a fresh table, so rows and arrows replay and never pile up. */}
          <GateDetail key={selected} gate={gates.find((g) => g.id === selected)!} job={job} />
        </div>
      )}
    </div>
  );
}
