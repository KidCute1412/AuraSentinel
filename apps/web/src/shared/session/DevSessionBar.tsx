import { Wrench, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AVALANCHE_FUJI_CHAIN_ID } from "@agentshield/shared";
import { FIXTURE_OWNER, FIXTURE_SAFES, FIXTURE_STRANGER } from "@/shared/api/vaultSource";
import { shortAddress } from "@/shared/lib/address";
import { useSession } from "./sessionStore";
import { useWizardSafe } from "./wizardSafe";

type Persona = "guest" | "owner" | "stranger" | "wrong-chain";

const PERSONAS: { id: Persona; label: string }[] = [
  { id: "guest", label: "Guest (no wallet)" },
  { id: "owner", label: "Owner" },
  { id: "stranger", label: "Other wallet" },
  { id: "wrong-chain", label: "Owner, wrong network" },
];

const sel = "min-h-9 w-full border border-line-strong bg-surface px-2 font-mono text-xs text-fg";

/** Development-only switcher so every guard and role can be exercised without a real wallet. Not rendered in production builds. */
export function DevSessionBar() {
  const [open, setOpen] = useState(false);
  const { wallet, connect, disconnect } = useSession();
  const { safe: wizardSafe, setSafe } = useWizardSafe();

  const persona: Persona = !wallet ? "guest" : wallet.chainId !== AVALANCHE_FUJI_CHAIN_ID ? "wrong-chain" : wallet.address === FIXTURE_OWNER ? "owner" : "stranger";
  const choose = (p: Persona) => {
    if (p === "guest") disconnect();
    else if (p === "owner") connect(FIXTURE_OWNER);
    else if (p === "stranger") connect(FIXTURE_STRANGER);
    else connect(FIXTURE_OWNER, 1);
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label="Open dev bar" className="fixed bottom-3 left-3 z-50 inline-flex size-10 items-center justify-center border-2 border-line-strong bg-surface text-fg shadow-hard-sm hover:bg-hover">
        <Wrench aria-hidden className="size-4" />
      </button>
    );
  }

  return (
    <aside aria-label="Dev bar" className="fixed bottom-3 left-3 z-50 w-72 max-w-[calc(100vw-1.5rem)] space-y-3 border-2 border-line-strong bg-surface p-3 shadow-hard">
      <div className="flex items-center justify-between">
        <span className="mono-label">DEV · development builds only</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close dev bar" className="inline-flex size-8 items-center justify-center hover:bg-hover">
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <label className="block space-y-1">
        <span className="mono-label">Connected wallet</span>
        <select className={sel} value={persona} onChange={(e) => choose(e.target.value as Persona)}>
          {PERSONAS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        {wallet && <span className="block font-mono text-[11px] text-muted">{shortAddress(wallet.address)} · chain {wallet.chainId}</span>}
      </label>

      <label className="block space-y-1">
        <span className="mono-label">Safe being set up (wizard)</span>
        <select className={sel} value={wizardSafe ?? ""} onChange={(e) => setSafe((e.target.value || null) as `0x${string}` | null)}>
          <option value="">No Safe selected</option>
          <option value={FIXTURE_SAFES.stoppedAtModule}>Stopped at step 2 (module)</option>
          <option value={FIXTURE_SAFES.stoppedAtPolicy}>Stopped at step 3 (policy)</option>
          <option value={FIXTURE_SAFES.healthy}>Fully set up</option>
        </select>
      </label>

      <div className="space-y-1">
        <span className="mono-label">Sample vaults</span>
        <ul className="grid grid-cols-2 gap-1 font-mono text-xs font-bold">
          {([["healthy", "Healthy"], ["killed", "Killed"], ["stoppedAtModule", "Incomplete"], ["demo", "Demo"]] as const).map(([k, label]) => (
            <li key={k}>
              <Link className="block border border-line px-2 py-2 text-accent-text hover:bg-hover" to={`/vaults/${FIXTURE_SAFES[k]}`}>{label}</Link>
            </li>
          ))}
          <li><Link className="block border border-line px-2 py-2 text-accent-text hover:bg-hover" to="/vaults/0x123">Bad address</Link></li>
          <li><Link className="block border border-line px-2 py-2 text-accent-text hover:bg-hover" to="/vaults/new/fund">Jump to step 4</Link></li>
        </ul>
      </div>
    </aside>
  );
}
