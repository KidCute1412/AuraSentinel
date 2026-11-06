import { useState, type FormEvent } from "react";
import { Stamp } from "@/shared/ui/Stamp";
import { primaryCta } from "@/features/landing/cta";
import { react } from "@/shared/mascot/mascotStore";
import { LINES } from "@/shared/mascot/lines";
import type { GateMode } from "./WalletPanel";

const field =
  "mt-1 block h-12 w-full border border-line-strong bg-bg px-3 font-mono text-sm text-fg placeholder:text-muted";

/** Classic email form. UI only: the backend is wallet-first (SIWE), so submitting explains that. */
export function EmailPanel({ mode, onUseWallet }: { mode: GateMode; onUseWallet: () => void }) {
  const [notice, setNotice] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNotice(true);
    react("whoa", { text: LINES.gate.email, hold: 1200 });
  };
  return (
    <form onSubmit={submit} className="min-h-[15rem]" aria-live="polite">
      <label className="block">
        <span className="mono-label">Email</span>
        <input type="email" name="email" autoComplete="email" required placeholder="you@domain.com" className={field} />
      </label>
      <label className="mt-4 block">
        <span className="mono-label">Password</span>
        <input type="password" name="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8} placeholder="8+ characters" className={field} />
      </label>
      {mode === "signup" && (
        <label className="mt-4 block">
          <span className="mono-label">Confirm password</span>
          <input type="password" name="confirm" autoComplete="new-password" required minLength={8} className={field} />
        </label>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="drop-hard"><button type="submit" className={primaryCta}>{mode === "signin" ? "Sign in" : "Create account"}</button></span>
      </div>
      {notice && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border border-warn bg-tint-amber p-3">
          <Stamp tone="warn" animate>Not live yet</Stamp>
          <span className="text-sm text-soft">
            Accounts are wallet-based for now.{" "}
            <button type="button" onClick={onUseWallet} className="font-bold text-accent-text underline">Use your wallet</button>
          </span>
        </div>
      )}
    </form>
  );
}
