import { useState } from "react";
import { formatUnits } from "@agentshield/shared";
import type { TokenSymbol } from "@/shared/api/mockEngine";
import { cn } from "@/shared/lib/cn";
import { formatTokenAmount } from "@/shared/lib/format";
import { Panel } from "@/shared/ui/Panel";
import { TxButton } from "@/shared/ui/TxButton";
import type { FundsControl, FundsToken } from "../hooks/useFundsControl";
import { parseLimit } from "../lib/policyForm";

type Direction = "deposit" | "withdraw";

const waitText = (availableAt: number): string => {
  const mins = Math.max(1, Math.ceil((availableAt - Date.now() / 1000) / 60));
  if (mins < 60) return `in ${mins} min`;
  return mins % 60 === 0 ? `in ${mins / 60} h` : `in ${Math.floor(mins / 60)} h ${mins % 60} min`;
};

/** Test tokens for the owner's wallet: one drip per token per cooldown (MockUSDC / MockWAVAX on Fuji). */
function Faucet({ tokens, control }: { tokens: FundsToken[]; control: FundsControl }) {
  const withFaucet = tokens.filter((t) => t.faucetAmount !== null && t.faucetAmount > 0n);
  if (withFaucet.length === 0) return null;
  return (
    <div className="mt-5 space-y-3 border-t border-line pt-4">
      <div>
        <h3 className="mono-label">Test tokens</h3>
        <p className="mt-1 text-xs text-muted">Free testnet tokens for your wallet, then deposit them. Not real money.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {withFaucet.map((t) => {
          const waiting = t.faucetAvailableAt > 0;
          return (
            <TxButton
              key={t.symbol}
              variant="secondary"
              send={control.faucet(t.symbol)}
              disabled={waiting}
              disabledReason={waiting ? `Next ${t.symbol} drip ${waitText(t.faucetAvailableAt)}.` : undefined}
            >
              Get {formatTokenAmount(t.faucetAmount!, t.decimals, 2)} {t.symbol}
            </TxButton>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Move tokens between the owner's wallet and the vault. Both directions are signed in the owner's wallet and sent
 * straight to the chain: deposit is a token transfer, withdraw a Safe transaction that always pays the signing owner.
 */
export function FundsPanel({ control, depositOnly = false, title = "Funds" }: { control: FundsControl; depositOnly?: boolean; title?: string }) {
  const [direction, setDirection] = useState<Direction>("deposit");
  const [symbol, setSymbol] = useState<TokenSymbol>("USDC");
  const [amount, setAmount] = useState("");

  if (!control.canAct) {
    return (
      <Panel title={title}>
        <p className="text-sm text-soft">{control.notice ?? "Reading the vault's owners from the chain…"}</p>
      </Panel>
    );
  }

  const token = control.tokens.find((t) => t.symbol === symbol)!;
  const available = direction === "deposit" ? token.wallet : token.vault;
  const parsed = amount === "" ? null : parseLimit(amount, token.decimals);
  const value = parsed && "value" in parsed ? parsed.value : null;
  const tooMuch = value !== null && available !== null && value > available;
  const error = parsed && "error" in parsed ? parsed.error : tooMuch ? `Not enough ${symbol} ${direction === "deposit" ? "in your wallet" : "in the vault"}` : null;

  return (
    <Panel title={title}>
      {!depositOnly && (
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
      )}

      <div className={cn("space-y-3", !depositOnly && "mt-4")}>
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
            {control.tokens.map((t) => (
              <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
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
            <button
              type="button"
              disabled={available === null}
              onClick={() => available !== null && setAmount(formatUnits(available, token.decimals))}
              className="border border-l-0 border-line-strong bg-hover px-3 font-mono text-xs font-bold hover:bg-line disabled:opacity-50"
            >
              Max
            </button>
          </div>
          {error ? (
            <p id="funds-err" className="mt-1 text-xs text-danger-text">{error}</p>
          ) : (
            <p id="funds-hint" className="mt-1 text-xs text-muted">
              {direction === "deposit" ? "In your wallet" : "In the vault"}:{" "}
              <span className="tabular text-soft">{available === null ? "reading…" : `${formatTokenAmount(available, token.decimals, 4)} ${symbol}`}</span>
            </p>
          )}
        </div>
        {value !== null && !error && (
          <p className="border border-line bg-bg px-3 py-2 text-xs text-soft">
            You will {direction === "deposit" ? "send" : "receive"} <span className="tabular font-bold text-fg">{formatTokenAmount(value, token.decimals, 6)} {symbol}</span>{" "}
            {direction === "deposit" ? "to the vault" : "from the vault to your wallet"}. Vault balance after:{" "}
            <span className="tabular text-fg">{formatTokenAmount(token.vault + (direction === "deposit" ? value : -value), token.decimals, 4)} {symbol}</span>
          </p>
        )}
        <TxButton
          send={direction === "deposit" ? control.deposit(symbol, value ?? 0n) : control.withdraw(symbol, value ?? 0n)}
          disabled={value === null || !!error}
          disabledReason={value === null ? "Enter an amount to continue." : undefined}
          onConfirmed={() => setAmount("")}
        >
          {direction === "deposit" ? "Sign and deposit" : "Sign and withdraw"}
        </TxButton>
        {direction === "withdraw" && <p className="text-xs text-muted">Withdrawals always go to the wallet that signs them.</p>}
      </div>

      <Faucet tokens={control.tokens} control={control} />
    </Panel>
  );
}
