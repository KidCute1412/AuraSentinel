import { useState } from "react";
import { formatUnits, fromAmount, type StateDto } from "@agentshield/shared";
import { moveFundsTx, WALLET_BALANCES } from "@/shared/api/mockChain";
import { balanceOf, TOKENS, type TokenSymbol } from "@/shared/api/mockEngine";
import { cn } from "@/shared/lib/cn";
import { formatTokenAmount } from "@/shared/lib/format";
import { Panel } from "@/shared/ui/Panel";
import { TxButton } from "@/shared/ui/TxButton";
import { parseLimit } from "../lib/policyForm";

type Direction = "deposit" | "withdraw";

/** Move tokens between the owner's wallet and the vault. Owner only; both directions are signed in the wallet. */
export function FundsPanel({ safe, state }: { safe: string; state: StateDto }) {
  const [direction, setDirection] = useState<Direction>("deposit");
  const [symbol, setSymbol] = useState<TokenSymbol>("USDC");
  const [amount, setAmount] = useState("");
  const token = TOKENS[symbol];
  const available = direction === "deposit" ? WALLET_BALANCES[symbol] : balanceOf(state, symbol);
  const parsed = amount === "" ? null : parseLimit(amount, token.decimals);
  const value = parsed && "value" in parsed ? parsed.value : null;
  const tooMuch = value !== null && value > available;
  const error = parsed && "error" in parsed ? parsed.error : tooMuch ? `Not enough ${symbol} ${direction === "deposit" ? "in your wallet" : "in the vault"}` : null;

  return (
    <Panel title="Funds">
      <div role="tablist" aria-label="Deposit or withdraw" className="grid grid-cols-2 border border-line-strong">
        {(["deposit", "withdraw"] as const).map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={direction === d}
            type="button"
            onClick={() => {
              setDirection(d);
              setAmount("");
            }}
            className={cn("min-h-11 text-sm font-bold capitalize", direction === d ? "bg-ink text-bg" : "hover:bg-hover")}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="funds-token" className="mono-label">Token</label>
          <select
            id="funds-token"
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value as TokenSymbol);
              setAmount("");
            }}
            className="mt-1 min-h-11 w-full border border-line-strong bg-surface px-3 font-mono text-sm"
          >
            {(Object.keys(TOKENS) as TokenSymbol[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="funds-amount" className="mono-label">Amount</label>
          <div className="mt-1 flex items-stretch">
            <input
              id="funds-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "funds-err" : "funds-hint"}
              className={cn("min-h-11 w-full border bg-surface px-3 font-mono text-sm", error ? "border-danger" : "border-line-strong")}
            />
            <button type="button" onClick={() => setAmount(formatUnits(available, token.decimals))} className="border border-l-0 border-line-strong bg-hover px-3 font-mono text-xs font-bold hover:bg-line">
              Max
            </button>
          </div>
          {error ? (
            <p id="funds-err" className="mt-1 text-xs text-danger-text">{error}</p>
          ) : (
            <p id="funds-hint" className="mt-1 text-xs text-muted">
              {direction === "deposit" ? "In your wallet" : "In the vault"}: <span className="tabular text-soft">{formatTokenAmount(available, token.decimals, 4)} {symbol}</span>
            </p>
          )}
        </div>
        {value !== null && !error && (
          <p className="border border-line bg-bg px-3 py-2 text-xs text-soft">
            You will {direction === "deposit" ? "send" : "receive"} <span className="tabular font-bold text-fg">{formatTokenAmount(value, token.decimals, 6)} {symbol}</span>{" "}
            {direction === "deposit" ? "to the vault" : "from the vault to your wallet"}. Vault balance after:{" "}
            <span className="tabular text-fg">{formatTokenAmount(fromAmount(state.balances.find((b) => b.symbol === symbol)?.amount ?? "0") + (direction === "deposit" ? value : -value), token.decimals, 4)} {symbol}</span>
          </p>
        )}
        <TxButton
          send={moveFundsTx(safe, direction, symbol, value ?? 0n)}
          disabled={value === null || !!error}
          disabledReason={value === null ? "Enter an amount to continue." : undefined}
          onConfirmed={() => setAmount("")}
        >
          {direction === "deposit" ? "Sign and deposit" : "Sign and withdraw"}
        </TxButton>
      </div>
    </Panel>
  );
}
