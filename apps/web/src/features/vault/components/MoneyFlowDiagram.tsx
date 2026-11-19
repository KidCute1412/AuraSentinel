import { ArrowLeft, ArrowRight, Check, Landmark, Repeat, UserX, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { shortAddress } from "@/shared/lib/address";
import { formatValue } from "../lib/checks";
import type { MoneyFlow } from "../lib/moneyFlow";

const abs = (v: NonNullable<MoneyFlow["paid"]>) => ({ ...v, amount: v.amount.replace(/^-/, "") });

function Node({ icon: Icon, title, sub, tone = "plain" }: { icon: typeof Landmark; title: string; sub: string; tone?: "plain" | "ok" | "bad" }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center justify-center border-2 px-2 py-2 text-center",
        tone === "ok" ? "border-accent bg-tint-mint" : tone === "bad" ? "border-danger bg-tint-pink" : "border-line-strong bg-surface",
      )}
    >
      <Icon aria-hidden strokeWidth={2.5} className={cn("size-4", tone === "bad" ? "text-danger-text" : "text-fg")} />
      <span className="mt-1 font-mono text-[11px] font-bold uppercase tracking-widest">{title}</span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{sub}</span>
    </div>
  );
}

/** One labelled arrow. The line draws from its source side (200ms), the amount sits on it. */
function Arrow({ dir, text, tone = "plain", delay = 0 }: { dir: "r" | "l"; text: string; tone?: "plain" | "ok" | "bad"; delay?: number }) {
  const Head = dir === "r" ? ArrowRight : ArrowLeft;
  const color = tone === "bad" ? "text-danger-text" : tone === "ok" ? "text-accent-text" : "text-fg";
  return (
    <div className={cn("flex flex-col items-stretch", color)}>
      {/* Wraps instead of truncating: an amount is never cut off on a phone. */}
      <span className="tabular break-words px-1 text-center font-mono text-[11px] font-bold leading-tight sm:text-xs">{text}</span>
      <span className="flex items-center">
        {dir === "l" && <Head aria-hidden strokeWidth={3} className="-mr-1 size-4 shrink-0" />}
        <span
          className={cn("h-0 flex-1 border-t-2", tone === "bad" ? "border-dashed border-danger" : "border-current", dir === "r" ? "flow-draw-r" : "flow-draw-l")}
          style={{ animationDelay: `${delay}ms` }}
        />
        {dir === "r" && <Head aria-hidden strokeWidth={3} className="-ml-1 size-4 shrink-0" />}
      </span>
    </div>
  );
}

/**
 * Where the money went in this gate, drawn: vault → router → vault, and whether anyone else gained. Rehearsal
 * numbers come from the simulation rows, chain numbers from the mined receipt; the text summary below is the
 * accessible version of the same facts.
 */
export function MoneyFlowDiagram({ flow }: { flow: MoneyFlow }) {
  const title = flow.redirect ? "Where the proceeds would go" : flow.source === "chain" ? "What really moved · measured on-chain" : "What the rehearsal moved";
  const summary = flow.redirect
    ? `The trade asked to send the proceeds to ${flow.redirect}, not to the vault. Blocked before anything moved.`
    : [
        flow.paid && `The vault paid ${formatValue(abs(flow.paid))}.`,
        flow.received && `The vault received ${formatValue(flow.received)}.`,
        flow.others && `Anyone else gained ${formatValue(flow.others.value)}.`,
      ]
        .filter(Boolean)
        .join(" ");

  return (
    <figure className="mx-4 mt-3 border border-line bg-bg p-3">
      <figcaption className="mono-label mb-2">{title}</figcaption>
      <div aria-hidden className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] items-center gap-1.5">
        <Node icon={Landmark} title="Vault" sub="the safe" tone={flow.redirect ? "plain" : "ok"} />
        <div className="space-y-2">
          {flow.redirect ? (
            <Arrow dir="r" text="trade" />
          ) : (
            <>
              {flow.paid && <Arrow dir="r" text={`−${formatValue(abs(flow.paid))}`} />}
              {flow.received && <Arrow dir="l" text={`+${formatValue(flow.received)}`} tone="ok" delay={160} />}
            </>
          )}
        </div>
        <Node icon={Repeat} title="Router" sub="the exchange" />
      </div>

      {flow.redirect && (
        <div aria-hidden className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] items-center gap-1.5">
          <span />
          <Arrow dir="l" text="proceeds" tone="bad" delay={160} />
          <Node icon={UserX} title="Stranger" sub={shortAddress(flow.redirect)} tone="bad" />
        </div>
      )}

      {flow.others && (
        <p className={cn("mt-2 flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-widest", flow.others.ok ? "text-accent-text" : "text-danger-text")}>
          {flow.others.ok ? <Check aria-hidden strokeWidth={3} className="size-3.5" /> : <X aria-hidden strokeWidth={3} className="size-3.5" />}
          Anyone else gained: {formatValue(flow.others.value)}
        </p>
      )}
      <p className="sr-only">{summary}</p>
    </figure>
  );
}
