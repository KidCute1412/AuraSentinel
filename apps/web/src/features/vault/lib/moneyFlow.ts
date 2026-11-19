import type { CheckRow, CheckValue } from "@agentshield/shared";
import type { StepId } from "./timeline";

type Amount = Extract<CheckValue, { type: "amount" }>;

/**
 * Where the money went, as the gate recorded it: the vault pays the router, the router pays the vault back, and
 * nobody else may gain. Only from the gate's own rows (never recomputed), so the picture and the table agree.
 */
export interface MoneyFlow {
  /** "rehearsal" = the simulation on a private copy; "chain" = measured from the mined transaction. */
  source: "rehearsal" | "chain";
  paid: Amount | null;
  received: Amount | null;
  /** What anyone other than the vault gained (invariants only). */
  others: { value: Amount; ok: boolean } | null;
  /** A recipient other than the vault (pre-check caught it): the proceeds would have gone there. */
  redirect: `0x${string}` | null;
}

const amountOf = (rows: readonly CheckRow[], id: string): Amount | null => {
  const v = rows.find((r) => r.id === id)?.actual;
  return v?.type === "amount" ? v : null;
};

export function moneyFlow(gate: StepId, rows: readonly CheckRow[]): MoneyFlow | null {
  if (gate === "precheck") {
    const r = rows.find((c) => c.id === "recipient");
    if (!r || r.pass || r.actual?.type !== "address") return null;
    return { source: "rehearsal", paid: null, received: null, others: null, redirect: r.actual.value };
  }
  if (gate === "simulation") {
    const paid = amountOf(rows, "sim-token-in");
    const received = amountOf(rows, "sim-token-out");
    return paid || received ? { source: "rehearsal", paid, received, others: null, redirect: null } : null;
  }
  if (gate === "invariant") {
    const paid = amountOf(rows, "inv-input");
    const received = amountOf(rows, "inv-output");
    const attacker = rows.find((c) => c.id === "inv-attacker");
    const others = attacker?.actual?.type === "amount" ? { value: attacker.actual, ok: attacker.pass } : null;
    return paid || received || others ? { source: "rehearsal", paid, received, others, redirect: null } : null;
  }
  const paid = amountOf(rows, "chain-paid");
  const received = amountOf(rows, "chain-received");
  return paid || received ? { source: "chain", paid, received, others: null, redirect: null } : null;
}
