import { formatUnits } from "@agentshield/shared";

/**
 * Display-only money formatting in en-US style ("1,500.5"). Pure bigint math, never Number() on money (invariant 4).
 * Truncates (never rounds up) so the UI cannot overstate a balance; tiny non-zero amounts show as "<0.01".
 */
export function formatTokenAmount(value: bigint, decimals: number, maxFrac = 2): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const [whole, frac = ""] = formatUnits(abs, decimals).split(".");
  const cut = frac.slice(0, maxFrac).replace(/0+$/, "");
  if (abs > 0n && whole === "0" && cut === "") {
    return maxFrac > 0 ? `<0.${"0".repeat(maxFrac - 1)}1` : "<1";
  }
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}${cut ? `.${cut}` : ""}`;
}

/** Percentage for display only (e.g. budgetUsedPct). Never feed the result back into money math. */
export function formatPct(pct: number, frac = 1): string {
  return `${pct.toFixed(frac)}%`;
}
