import { Check } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { formatTokenAmount } from "@/shared/lib/format";
import { parseAddressParam, shortAddress } from "@/shared/lib/address";
import { cn } from "@/shared/lib/cn";
import { DEFAULT_POLICY_VALUES, WIZARD_MIN_GAS_WEI } from "@/shared/lib/wizard";
import { useWizardSafe } from "@/shared/session/wizardSafe";
import { Panel } from "@/shared/ui/Panel";
import { SnowtraceLink } from "@/shared/ui/SnowtraceLink";
import { Stamp } from "@/shared/ui/Stamp";
import { TxButton } from "@/shared/ui/TxButton";
import { usePageMood } from "@/shared/mascot/usePageMood";
import { LINES } from "@/shared/mascot/lines";
import { WalletButton } from "@/shared/web3/WalletButton";
import { FundsPanel } from "../components/FundsPanel";
import { ExpiryChoice, LimitField } from "../components/LimitField";
import type { WizardControl } from "../hooks/useWizardControl";
import { TOKENS } from "@/shared/api/mockEngine";
import { validatePolicy, type PolicyErrors, type PolicyFormValues } from "../lib/policyForm";

/** Core's Fuji faucet: test AVAX for gas (needs a small mainnet balance or a coupon). */
const AVAX_FAUCET = "https://core.app/tools/testnet-faucet/?subnet=c&token=c";

function Address({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-2 last:border-b-0">
      <dt className="mono-label">{label}</dt>
      <dd className="flex items-center gap-3">
        <span className="font-mono text-sm" title={value}>{shortAddress(value)}</span>
        <SnowtraceLink kind="address" value={value} />
      </dd>
    </div>
  );
}

function Notice({ tone = "warn", children }: { tone?: "warn" | "danger"; children: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("border-l-4 px-3 py-2 text-sm text-fg", tone === "danger" ? "border-danger bg-tint-pink" : "border-warn bg-tint-amber")}>
      {children}
    </div>
  );
}

/** A finished sub-step: what the chain now says, in one line. */
function Done({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm font-bold text-accent-text">
      <Check aria-hidden strokeWidth={3} className="size-4" />
      {children}
    </p>
  );
}

// ------------------------------------------------------------------ step 1

function ExistingSafe() {
  const setSafe = useWizardSafe((s) => s.setSafe);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const parsed = parseAddressParam(text.trim());
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="block text-sm font-bold text-accent-text underline underline-offset-4">
        I already have a Safe on Fuji
      </button>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed) setSafe(parsed);
      }}
    >
      <label htmlFor="existing-safe" className="mono-label">Safe address</label>
      <div className="flex items-stretch">
        <input
          id="existing-safe"
          autoComplete="off"
          placeholder="0x…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={text !== "" && !parsed}
          className={cn("min-h-11 w-full border bg-surface px-3 font-mono text-sm", text !== "" && !parsed ? "border-danger" : "border-line-strong")}
        />
        <button type="submit" disabled={!parsed} className="border border-l-0 border-line-strong bg-hover px-4 text-sm font-bold hover:bg-line disabled:opacity-50">
          Use
        </button>
      </div>
      <p className="text-xs text-muted">It must be a single-owner Safe owned by the connected wallet.</p>
    </form>
  );
}

export function SafeStep({ control, readOnly }: { control: WizardControl; readOnly: boolean }) {
  const lowGas = control.gas !== null && control.gas < WIZARD_MIN_GAS_WEI;
  if (readOnly && control.safe) {
    return (
      <Panel title="Step 1 · Safe" aside={<Stamp tone="ok">Done</Stamp>}>
        <dl>
          <Address label="Safe" value={control.safe} />
          {control.owner && <Address label="Owner (you)" value={control.owner} />}
        </dl>
      </Panel>
    );
  }
  const pending = !!control.safe && control.facts !== null && !control.facts.safeExists;
  return (
    <Panel title="Step 1 · Safe">
      <div className="space-y-4">
        <p className="max-w-2xl text-soft">
          The vault is a <span className="font-bold text-fg">Safe</span> smart account (v1.4.1) with your wallet as its only owner. Funds sit in the Safe, not with us, and only
          your wallet can move them out.
        </p>
        <p className="text-sm text-muted">About 5 confirmations in your wallet for the whole setup, a few minutes in total. Every step is a Fuji testnet transaction.</p>
        {!control.owner && (
          <div className="flex flex-wrap items-center gap-3 border-l-4 border-warn bg-tint-amber px-3 py-2 text-sm">
            <span>Connect the wallet that will own the vault.</span>
            <WalletButton />
          </div>
        )}
        {lowGas && (
          <Notice>
            Your wallet has {formatTokenAmount(control.gas!, 18, 3)} AVAX. The setup needs a little AVAX for gas on Fuji (keep at least 0.02).{" "}
            <a href={AVAX_FAUCET} target="_blank" rel="noopener noreferrer" className="font-bold text-accent-text underline underline-offset-4">
              Get test AVAX<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Notice>
        )}
        {pending && <Notice>Waiting for Safe {shortAddress(control.safe!)} to appear on the chain. If its transaction failed, create it again.</Notice>}
        <TxButton send={control.createSafe} disabled={!control.owner} disabledReason={!control.owner ? "Connect your wallet first." : undefined}>
          Sign and create Safe
        </TxButton>
        <ExistingSafe />
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ step 2

export function ModuleStep({ control, readOnly }: { control: WizardControl; readOnly: boolean }) {
  const f = control.facts;
  const module = f?.module ?? null;
  return (
    <Panel title="Step 2 · Guard module" aside={readOnly ? <Stamp tone="ok">Done</Stamp> : undefined}>
      <div className="space-y-5">
        <p className="max-w-2xl text-soft">
          The <span className="font-bold text-fg">AgentPolicyModule</span> is the on-chain guard: the agent can only trade through it, and it checks every swap against your
          limits. You own it; our server never can change it.
        </p>
        <ol className="space-y-4">
          <li className="space-y-2 border-l-2 border-line-strong pl-4">
            <h3 className="text-base">a. Deploy your module</h3>
            {module ? (
              <>
                <Done>Module deployed</Done>
                <dl><Address label="Module" value={module} /></dl>
              </>
            ) : (
              <TxButton send={control.deployModule} disabled={readOnly}>Sign and deploy module</TxButton>
            )}
          </li>
          <li className="space-y-2 border-l-2 border-line-strong pl-4">
            <h3 className={cn("text-base", !module && "text-muted")}>b. Enable it on the Safe</h3>
            {f?.moduleEnabled ? (
              <Done>Enabled on the Safe</Done>
            ) : module ? (
              <TxButton send={control.enableModule} disabled={readOnly}>Sign and enable module</TxButton>
            ) : (
              <p className="text-sm text-muted">After the module is deployed.</p>
            )}
          </li>
        </ol>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ step 3

export function PolicyStep({ control, readOnly }: { control: WizardControl; readOnly: boolean }) {
  const [values, setValues] = useState<PolicyFormValues>(DEFAULT_POLICY_VALUES);
  const nowSec = Math.floor(Date.now() / 1000);
  // Checked as the owner types: the same rules the module applies, so the wallet only opens for a valid policy.
  const result = validatePolicy(values, nowSec);
  const errors: PolicyErrors = result.ok ? {} : result.errors;
  const set = <K extends keyof PolicyFormValues>(k: K, v: PolicyFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));
  const send = () => (result.ok ? control.setPolicy(result.input)() : Promise.reject(new Error("Invalid policy")));
  const day = (unix: number) => new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <Panel title="Step 3 · Policy" aside={readOnly ? <Stamp tone="ok">Done</Stamp> : undefined}>
      <div className="space-y-5">
        <p className="max-w-2xl text-soft">
          The limits the agent can never exceed, enforced by your module on every swap. The agent may only swap between USDC and WAVAX through Trader Joe, and the
          proceeds always stay in your Safe.
        </p>
        <dl data-aura="inspect" data-aura-line="that's my wallet." className="border border-line bg-bg px-3">
          <Address label="Agent (AuraSentinel)" value={control.agent.agent} />
          <Address label="DEX router (Trader Joe)" value={control.agent.router} />
        </dl>
        {readOnly ? (
          <Done>Policy active</Done>
        ) : (
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="grid gap-3 sm:grid-cols-2">
              <LimitField id="w-usdc-max" label="USDC per transaction" unit="USDC" value={values.usdcMaxPerTx} error={errors.usdcMaxPerTx} onChange={(v) => set("usdcMaxPerTx", v)} />
              <LimitField id="w-usdc-day" label="USDC per day" unit="USDC" value={values.usdcDailyCap} error={errors.usdcDailyCap} onChange={(v) => set("usdcDailyCap", v)} />
              <LimitField id="w-wavax-max" label="WAVAX per transaction" unit={TOKENS.WAVAX.symbol} value={values.wavaxMaxPerTx} error={errors.wavaxMaxPerTx} onChange={(v) => set("wavaxMaxPerTx", v)} />
              <LimitField id="w-wavax-day" label="WAVAX per day" unit={TOKENS.WAVAX.symbol} value={values.wavaxDailyCap} error={errors.wavaxDailyCap} onChange={(v) => set("wavaxDailyCap", v)} />
            </div>
            <ExpiryChoice name="wizard-expiry" value={values.expiryDays} error={errors.expiryDays} onChange={(d) => set("expiryDays", d)} />
            {result.ok && (
              <p data-aura="inspect" data-aura-line="read it. then sign." className="border border-line bg-bg px-3 py-2 text-sm text-soft">
                In plain words: the agent can swap at most{" "}
                <span className="tabular font-bold text-fg">{formatTokenAmount(result.input.usdcMaxPerTx, 6, 2)} USDC</span> per trade and{" "}
                <span className="tabular font-bold text-fg">{formatTokenAmount(result.input.usdcDailyCap, 6, 2)} USDC</span> per day (WAVAX:{" "}
                <span className="tabular font-bold text-fg">{formatTokenAmount(result.input.wavaxMaxPerTx, 18, 4)}</span> /{" "}
                <span className="tabular font-bold text-fg">{formatTokenAmount(result.input.wavaxDailyCap, 18, 4)}</span>), until{" "}
                <span className="font-bold text-fg">{day(result.input.expiry)}</span>. Anything above is refused on-chain.
              </p>
            )}
            <p className="text-xs text-muted">You can change these limits, or stop the agent with the Kill-Switch, at any time from the vault page.</p>
            <TxButton send={send} disabled={!result.ok} disabledReason={!result.ok ? "Fix the highlighted limits first." : undefined}>
              Sign and set policy
            </TxButton>
          </form>
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ step 4

export function FundStep({ control }: { control: WizardControl }) {
  const empty = control.funds.tokens.every((t) => t.wallet === 0n);
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
      <Panel title="Step 4 · Fund">
        <div className="space-y-3 text-soft">
          <p>Move test tokens into the Safe so the agent has something to manage. Get them from the faucet first if your wallet has none.</p>
          {empty && <Notice>Your wallet has no test tokens yet. Use the Test tokens buttons in the Deposit panel first, then deposit.</Notice>}
          <p className="text-sm text-muted">These are testnet tokens (MockUSDC, MockWAVAX) with no real value. You can withdraw them back to your wallet at any time.</p>
          <dl className="border-t border-line pt-2">
            {control.funds.tokens.map((t) => (
              <div key={t.symbol} className="flex items-baseline justify-between gap-4 py-1">
                <dt className="mono-label">{t.symbol} in the vault</dt>
                <dd className="tabular text-sm text-fg">{formatTokenAmount(t.vault, t.decimals, 4)} {t.symbol}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Panel>
      <FundsPanel control={control.funds} depositOnly title="Deposit" />
    </div>
  );
}

// ------------------------------------------------------------------ done

/** After this long without the server, the vault opens anyway: its page reads the chain when the API is down. */
export const REGISTER_PATIENCE_MS = 15_000;

export function DoneStep({ control, onOpen, onStartOver }: { control: WizardControl; onOpen: () => void; onStartOver: () => void }) {
  const safe = control.safe!;
  const [patienceOver, setPatienceOver] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPatienceOver(true), REGISTER_PATIENCE_MS);
    return () => clearTimeout(t);
  }, []);
  const canOpen = control.registered || patienceOver;
  usePageMood("wizard-done", "cheer", LINES.vaultReady);
  return (
    <Panel title="Vault ready" aside={<Stamp tone="ok">Guarded</Stamp>}>
      <div id="wizard-done" className="space-y-4">
        <p className="max-w-2xl text-soft">
          Your Safe is guarded by your own module, the policy is active and the vault holds funds. The AuraSentinel agent can now rebalance it, always within your limits.
        </p>
        <dl>
          <Address label="Safe" value={safe} />
          {control.facts?.module && <Address label="Module" value={control.facts.module} />}
        </dl>
        <p className="text-xs text-muted">
          On this testnet demo the automatic rebalancer runs on a limited number of vaults; you can always start a swap yourself from the vault page.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onOpen}
            disabled={!canOpen}
            className="min-h-11 bg-accent px-5 text-sm font-bold text-on-accent shadow-hard hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            Open your vault
          </button>
          <button type="button" onClick={onStartOver} className="min-h-11 px-3 text-sm font-bold text-soft hover:text-fg">
            Create another vault
          </button>
        </div>
        {!control.registered && (
          <p role="status" className="text-xs text-muted">
            {patienceOver
              ? "AuraSentinel has not picked up the vault yet. You can open it anyway: balances and the Kill-Switch are read straight from the chain."
              : "Waiting for AuraSentinel to pick up the new vault (usually a few seconds)…"}
          </p>
        )}
      </div>
    </Panel>
  );
}

/** This wallet cannot finish the remembered Safe: say why and offer a clean start. */
export function BlockedStep({ control, onStartOver }: { control: WizardControl; onStartOver: () => void }) {
  return (
    <Panel title="Cannot continue" tone="danger">
      <div className="space-y-4">
        <Notice tone="danger">{control.blocker}</Notice>
        {control.safe && <dl><Address label="Safe" value={control.safe} /></dl>}
        <button type="button" onClick={onStartOver} className="min-h-11 border border-line-strong px-4 text-sm font-bold hover:bg-hover">
          Start a new vault
        </button>
      </div>
    </Panel>
  );
}
