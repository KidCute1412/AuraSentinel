import { useEffect } from "react";
import type { StateDto } from "@agentshield/shared";
import { ambient } from "@/shared/mascot/auraEvents";
import { LINES } from "@/shared/mascot/lines";
import { cn } from "@/shared/lib/cn";
import { formatPct, formatTokenAmount } from "@/shared/lib/format";
import { Panel } from "@/shared/ui/Panel";
import { spentUsdc, usdcLimit } from "@/shared/api/mockEngine";

/** Ok below 80%, warn from 80%, danger at 100% (design-system §3 Progress). */
export const budgetTone = (pct: number): "ok" | "warn" | "danger" => (pct >= 100 ? "danger" : pct >= 80 ? "warn" : "ok");

const FILL = { ok: "bg-accent", warn: "bg-warn", danger: "bg-danger" } as const;
const TEXT = { ok: "text-accent-text", warn: "text-warn", danger: "text-danger-text" } as const;

/** How much of today's USDC limit the agent has used. Money is exact bigint; the percentage is display only. */
export function BudgetBar({ state }: { state: StateDto }) {
  const spent = spentUsdc(state);
  const { dailyCap, maxPerTx } = usdcLimit(state);
  const pct = state.budgetUsedPct;
  const tone = budgetTone(pct);
  const left = dailyCap > spent ? dailyCap - spent : 0n;
  // Aura-kun notices a budget running out (once a minute at most, only while he is not busy).
  useEffect(() => {
    if (pct >= 100) ambient("budget", 60_000, "guard", { text: LINES.budgetGone, hold: 1800 });
    else if (pct >= 80) ambient("budget", 60_000, "worry", { text: LINES.budgetLow, hold: 1800 });
  }, [pct]);
  return (
    <Panel title="Daily budget" aside={<span className={cn("tabular text-sm font-bold", TEXT[tone])}>{formatPct(pct)}</span>}>
      <div
        role="progressbar"
        aria-label="Share of today's USDC limit used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="relative h-5 border border-line-strong bg-bg"
      >
        <div className={cn("h-full transition-[width] duration-200", FILL[tone])} style={{ width: `${pct}%` }} />
        {[25, 50, 75].map((t) => (
          <span key={t} aria-hidden className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${t}%` }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="tabular text-lg font-bold">
          {formatTokenAmount(spent, 6)} <span className="text-muted">/ {formatTokenAmount(dailyCap, 6)} USDC</span>
        </span>
        <span className="mono-label">{formatTokenAmount(left, 6)} left today</span>
      </div>
      <p className="mt-2 text-xs text-muted">
        The agent may move at most <span className="tabular text-soft">{formatTokenAmount(maxPerTx, 6)} USDC</span> per transaction. The limit resets daily.
      </p>
    </Panel>
  );
}
