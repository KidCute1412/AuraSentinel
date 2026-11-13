import { fromAmount, type StateDto } from "@agentshield/shared";
import type { VaultSim } from "@/shared/api/mockEngine";
import { shortAddress } from "@/shared/lib/address";
import { cn } from "@/shared/lib/cn";
import { formatTokenAmount } from "@/shared/lib/format";
import { Panel } from "@/shared/ui/Panel";
import { TokenAmount } from "@/shared/ui/TokenAmount";

type Row = StateDto["balances"][number];

/** Vault balances, with the before/after of the latest confirmed swap so the effect of a trade is visible at a glance. */
export function BalancesPanel({ state, lastChange }: { state: StateDto; lastChange: VaultSim["lastChange"] }) {
  const change = lastChange;
  const rows: Row[] = state.balances;
  const before = (symbol: string) => change?.before.find((b) => b.symbol === symbol);
  const after = (symbol: string) => change?.after.find((b) => b.symbol === symbol);

  return (
    <Panel title="Vault balances" aside={change ? <span className="mono-label">after job {shortAddress(change.jobId, 4, 4)}</span> : undefined}>
      <table className="w-full text-sm">
        <caption className="sr-only">Vault balances before and after the latest swap</caption>
        <thead>
          <tr className="mono-label text-left">
            <th scope="col" className="pb-2 font-medium">Token</th>
            {change && <th scope="col" className="pb-2 text-right font-medium">Before</th>}
            <th scope="col" className="pb-2 text-right font-medium">{change ? "After" : "Balance"}</th>
            {change && <th scope="col" className="pb-2 text-right font-medium">Change</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = before(r.symbol);
            const a = after(r.symbol);
            const delta = b && a ? fromAmount(a.amount) - fromAmount(b.amount) : 0n;
            return (
              <tr key={r.symbol} className="border-t border-line">
                <th scope="row" className="py-2.5 pr-2 text-left font-mono text-xs font-bold">{r.symbol}</th>
                {change && <td className="py-2.5 text-right text-muted"><TokenAmount amount={b?.amount ?? "0"} decimals={r.decimals} /></td>}
                <td className="py-2.5 text-right font-bold"><TokenAmount amount={(a ?? r).amount} decimals={r.decimals} /></td>
                {change && (
                  <td className={cn("py-2.5 text-right", delta === 0n && "text-muted")}>
                    <TokenAmount amount={delta.toString()} decimals={r.decimals} maxFrac={3} delta />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!change && <p className="mt-3 text-xs text-muted">No swaps yet. Run a rebalance to see the before and after.</p>}
      {change && (
        <p className="mt-3 text-xs text-muted">
          Current balance: {rows.map((r) => `${formatTokenAmount(fromAmount(r.amount), r.decimals, 3)} ${r.symbol}`).join(" · ")}
        </p>
      )}
    </Panel>
  );
}
