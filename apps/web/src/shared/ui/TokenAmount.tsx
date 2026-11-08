import { fromAmount } from "@agentshield/shared";
import { cn } from "@/shared/lib/cn";
import { formatTokenAmount } from "@/shared/lib/format";

interface Props {
  /** Base units as a decimal string (the wire format) or bigint. */
  amount: string | bigint;
  decimals: number;
  symbol?: string;
  maxFrac?: number;
  /** Signed deltas: green for +, red for -. */
  delta?: boolean;
  className?: string;
}

/** Money for display. Exact bigint formatting, mono tabular, never a float. */
export function TokenAmount({ amount, decimals, symbol, maxFrac = 2, delta, className }: Props) {
  const value = typeof amount === "bigint" ? amount : amount.startsWith("-") ? -fromAmount(amount.slice(1)) : fromAmount(amount);
  const text = formatTokenAmount(value, decimals, maxFrac);
  const tone = delta ? (value > 0n ? "text-accent-text" : value < 0n ? "text-danger-text" : "text-muted") : "";
  return (
    <span className={cn("tabular whitespace-nowrap", tone, className)} title={`${value.toString()} (base units)`}>
      {delta && value > 0n ? "+" : ""}
      {text}
      {symbol && <span className="ml-1 text-muted">{symbol}</span>}
    </span>
  );
}
