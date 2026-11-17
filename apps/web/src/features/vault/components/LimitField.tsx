import { cn } from "@/shared/lib/cn";
import { EXPIRY_CHOICES } from "../lib/policyForm";

const inputCls = "min-h-11 w-full border bg-surface px-3 font-mono text-sm text-fg placeholder:text-muted focus-visible:outline-2";

/** Policy form inputs, shared by the vault's Policy panel (L7) and the wizard's first policy (L9). */
export function LimitField({ id, label, unit, value, error, onChange }: { id: string; label: string; unit: string; value: string; error?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mono-label">{label}</label>
      <div className="mt-1 flex items-stretch">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          className={cn(inputCls, error ? "border-danger" : "border-line-strong")}
        />
        <span className="inline-flex items-center border border-l-0 border-line-strong bg-hover px-3 font-mono text-xs text-soft">{unit}</span>
      </div>
      {error && <p id={`${id}-err`} className="mt-1 text-xs text-danger-text">{error}</p>}
    </div>
  );
}

/** The policy expiry, as a segmented choice of fixed durations. */
export function ExpiryChoice({ value, error, onChange, name = "expiry" }: { value: number; error?: string; onChange: (days: number) => void; name?: string }) {
  return (
    <fieldset>
      <legend className="mono-label">Expires after</legend>
      <div className="mt-1 grid grid-cols-4 border border-line-strong">
        {EXPIRY_CHOICES.map((c) => (
          <label
            key={c.days}
            className={cn("flex min-h-11 cursor-pointer items-center justify-center border-r border-line-strong px-2 text-xs font-bold last:border-r-0 has-[:focus-visible]:outline-2", value === c.days ? "bg-ink text-bg" : "hover:bg-hover")}
          >
            <input type="radio" name={name} className="sr-only" checked={value === c.days} onChange={() => onChange(c.days)} />
            {c.label}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-danger-text">{error}</p>}
    </fieldset>
  );
}
