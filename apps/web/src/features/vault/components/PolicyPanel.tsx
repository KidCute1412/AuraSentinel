import { useState } from "react";
import { fromAmount, type StateDto } from "@agentshield/shared";
import { TOKENS, tokenAddressIn } from "@/shared/api/mockEngine";
import { cn } from "@/shared/lib/cn";
import { formatTokenAmount } from "@/shared/lib/format";
import { policyTokensIn } from "@/shared/lib/policy";
import { timeLeft } from "@/shared/lib/time";
import { Panel } from "@/shared/ui/Panel";
import { TxButton } from "@/shared/ui/TxButton";
import { ExpiryChoice, LimitField as Field } from "./LimitField";
import type { OwnerControl } from "../hooks/useOwnerControl";
import { policyDiff, validatePolicy, valuesFromState, type PolicyErrors, type PolicyFormValues } from "../lib/policyForm";

const limitOf = (state: StateDto, token: string) => state.policy.limits.find((l) => l.token.toLowerCase() === token.toLowerCase());

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <dt className="mono-label">{label}</dt>
      <dd className="tabular text-right text-sm">{children}</dd>
    </div>
  );
}

/**
 * Current limits, plus the owner's form to change them. Signing happens in the owner's wallet, never through the
 * backend (invariant 2). A locked vault re-activates by setting a fresh policy (new epoch). Agent and router are kept
 * as the chain holds them; only the limits and the expiry change.
 */
export function PolicyPanel({ state, control }: { state: StateDto; control: OwnerControl }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const canEdit = control.canSign;
  const tokens = policyTokensIn(state);
  // By symbol from the state's balances, so a live StateDto (real token addresses) reads the same way.
  const usdc = limitOf(state, tokenAddressIn(state, "USDC"));
  const wavax = limitOf(state, tokenAddressIn(state, "WAVAX"));
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PolicyFormValues>(() => valuesFromState(state));
  const [errors, setErrors] = useState<PolicyErrors>({});
  const [preview, setPreview] = useState<ReturnType<typeof validatePolicy> | null>(null);
  const locked = !state.isActive;
  const expiring = state.isActive && state.policy.expiry - nowSec < 3 * 86_400;

  const set = <K extends keyof PolicyFormValues>(k: K, v: PolicyFormValues[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setPreview(null);
  };
  const review = () => {
    const r = validatePolicy(values, nowSec);
    if (r.ok) {
      setErrors({});
      setPreview(r);
    } else {
      setPreview(null);
      setErrors(r.errors);
    }
  };
  const close = () => {
    setOpen(false);
    setPreview(null);
    setErrors({});
  };

  const money = (v: string | undefined, d: number, sym: string) => `${formatTokenAmount(fromAmount(v ?? "0"), d, 4)} ${sym}`;

  return (
    <Panel
      title="Policy"
      aside={
        <span className={cn("font-mono text-[11px] font-bold uppercase tracking-widest", locked ? "text-danger-text" : "text-accent-text")}>
          {locked ? "Locked" : "Active"} · epoch {state.policyEpoch}
        </span>
      }
    >
      <dl>
        <Row label="USDC per tx">{money(usdc?.maxPerTx, 6, "USDC")}</Row>
        <Row label="USDC per day">{money(usdc?.dailyCap, 6, "USDC")}</Row>
        <Row label="WAVAX per tx">{money(wavax?.maxPerTx, 18, "WAVAX")}</Row>
        <Row label="WAVAX per day">{money(wavax?.dailyCap, 18, "WAVAX")}</Row>
        <Row label="Expires in">
          <span className={cn(expiring && "text-warn")}>{locked ? "locked" : timeLeft(state.policy.expiry, nowSec)}</span>
        </Row>
      </dl>
      {expiring && <p className="mt-3 border-l-4 border-warn bg-tint-amber px-3 py-2 text-xs text-fg">This policy expires soon. Set a new one before the agent stops trading.</p>}

      {canEdit && !open && (
        <button
          type="button"
          onClick={() => {
            setValues(valuesFromState(state));
            setOpen(true);
          }}
          className="mt-4 min-h-11 w-full border border-line-strong px-4 text-sm font-bold hover:bg-hover"
        >
          {locked ? "Re-activate with a new policy" : "Edit policy"}
        </button>
      )}

      {canEdit && open && (
        <form
          className="mt-4 space-y-4 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
        >
          <h3 className="text-base">{locked ? "Re-activate with a new policy" : "Edit policy"}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field id="usdc-max" label="USDC per transaction" unit="USDC" value={values.usdcMaxPerTx} error={errors.usdcMaxPerTx} onChange={(v) => set("usdcMaxPerTx", v)} />
            <Field id="usdc-day" label="USDC per day" unit="USDC" value={values.usdcDailyCap} error={errors.usdcDailyCap} onChange={(v) => set("usdcDailyCap", v)} />
            <Field id="wavax-max" label="WAVAX per transaction" unit={TOKENS.WAVAX.symbol} value={values.wavaxMaxPerTx} error={errors.wavaxMaxPerTx} onChange={(v) => set("wavaxMaxPerTx", v)} />
            <Field id="wavax-day" label="WAVAX per day" unit={TOKENS.WAVAX.symbol} value={values.wavaxDailyCap} error={errors.wavaxDailyCap} onChange={(v) => set("wavaxDailyCap", v)} />
          </div>
          <ExpiryChoice value={values.expiryDays} error={errors.expiryDays} onChange={(d) => set("expiryDays", d)} />

          {preview?.ok ? (
            <div className="space-y-3 border border-line-strong bg-bg p-3">
              <p className="mono-label !text-fg">You are about to sign this change</p>
              <table className="w-full text-xs">
                <caption className="sr-only">Policy before and after</caption>
                <thead>
                  <tr className="mono-label text-left"><th className="py-1 font-medium">Limit</th><th className="py-1 font-medium">Now</th><th className="py-1 font-medium">New</th></tr>
                </thead>
                <tbody>
                  {policyDiff(state, preview.input, nowSec).map((r) => (
                    <tr key={r.label} className="border-t border-line">
                      <td className="py-1.5 pr-2 text-soft">{r.label}</td>
                      <td className="tabular py-1.5 pr-2 text-muted">{r.before}</td>
                      <td className={cn("tabular py-1.5", r.changed ? "font-bold text-accent-text" : "text-soft")}>{r.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-start gap-3">
                <TxButton
                  send={control.setPolicy(preview.input, tokens)}
                  disabled={!!control.policyBlocker(preview.input, tokens, nowSec)}
                  disabledReason={control.policyBlocker(preview.input, tokens, nowSec) ?? undefined}
                  onConfirmed={close}
                >
                  {locked ? "Sign and re-activate" : "Sign and save policy"}
                </TxButton>
                <button type="button" onClick={() => setPreview(null)} className="min-h-10 px-3 text-sm font-bold text-soft hover:text-fg">Back to editing</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="min-h-11 bg-accent px-5 text-sm font-bold text-on-accent shadow-hard hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm active:translate-x-0 active:translate-y-0 active:shadow-none">
                Review change
              </button>
              <button type="button" onClick={close} className="min-h-11 px-3 text-sm font-bold text-soft hover:text-fg">Cancel</button>
            </div>
          )}
        </form>
      )}
    </Panel>
  );
}
