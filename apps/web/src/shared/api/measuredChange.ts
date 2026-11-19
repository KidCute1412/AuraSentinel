import type { JobDetailDto, StateDto } from "@agentshield/shared";
import { sameAddress } from "@/shared/lib/address";
import type { VaultSim } from "./mockEngine";

/**
 * Before/after balances of a confirmed swap, from what the chain measured (the server's Shield 2 rows: net flow from
 * the receipt's Transfer logs, then the Safe balance at that block). Before = after − flow, so both columns are facts.
 * Null when the job is not a confirmed swap or predates these rows: the panel then shows no comparison rather than an
 * estimate.
 */
export function measuredChange(job: JobDetailDto | undefined, state: StateDto | null): VaultSim["lastChange"] {
  if (!job || !state || job.status !== "confirmed") return null;
  const rows = job.audit.find((a) => a.shield === "onchain")?.checks ?? [];

  const moves = new Map<string, { delta: bigint; after?: bigint }>();
  let current: string | null = null;
  for (const r of rows) {
    if ((r.id === "chain-paid" || r.id === "chain-received") && r.actual?.type === "amount") {
      current = r.actual.token.toLowerCase();
      moves.set(current, { delta: BigInt(r.actual.amount) });
    } else if (r.id === "chain-balance" && r.actual?.type === "amount" && current === r.actual.token.toLowerCase()) {
      moves.get(current)!.after = BigInt(r.actual.amount);
    }
  }
  if (moves.size === 0 || [...moves.values()].some((m) => m.after === undefined)) return null;

  const before: StateDto["balances"] = [];
  const after: StateDto["balances"] = [];
  for (const b of state.balances) {
    const m = [...moves.entries()].find(([token]) => sameAddress(token, b.token))?.[1];
    // A swap moves two tokens; any other balance is shown unchanged at its current value.
    const a = m ? m.after! : BigInt(b.amount);
    after.push({ ...b, amount: a.toString() });
    before.push({ ...b, amount: (m ? a - m.delta : a).toString() });
  }
  return { jobId: job.id, before, after };
}
