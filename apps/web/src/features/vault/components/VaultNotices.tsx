import { Database, Lock, ShieldAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { VaultSim } from "@/shared/api/mockEngine";
import { cn } from "@/shared/lib/cn";

function Notice({ tone, icon, title, children }: { tone: "danger" | "warn" | "info"; icon: ReactNode; title: string; children: ReactNode }) {
  const style = { danger: "border-danger bg-tint-pink", warn: "border-warn bg-tint-amber", info: "border-line-strong bg-tint-sky" }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 border-l-4 p-3 text-sm", style)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-soft">{children}</p>
      </div>
    </div>
  );
}

/** The situations the docs call out (ui-pages §4.4) that are not errors but the product working. */
export function VaultNotices({ sim }: { sim: VaultSim }) {
  const { state } = sim;
  const exhausted = state.isActive && state.budgetUsedPct >= 100;
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted">
        <Database aria-hidden className="size-3.5" />
        Data: simulated · no backend connected
      </p>
      {state.stale && (
        <Notice tone="warn" icon={<TriangleAlert aria-hidden className="size-4" />} title="Showing the last known data">
          We could not reach the network just now. Numbers may be a little old and will refresh on their own.
        </Notice>
      )}
      {!state.isActive && (
        <Notice tone="danger" icon={<Lock aria-hidden className="size-4" />} title="This vault is locked">
          The agent cannot spend anything. Actions you try below will still be answered, with the refusal reason PolicyInactive. The owner can re-activate by setting a new policy.
        </Notice>
      )}
      {exhausted && (
        <Notice tone="info" icon={<ShieldAlert aria-hidden className="size-4" />} title="Shield 2 is blocking: today's limit is used up">
          This is the rule working, not an error. New trades are refused until the daily limit resets.
        </Notice>
      )}
    </div>
  );
}
