import type { ReactNode } from "react";
import { ArrowUpRight, Construction } from "lucide-react";
import type { Address } from "viem";
import { ActivityPanel } from "@/features/activity/ActivityPanel";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";
import { FUJI } from "@/shared/web3/config";
import { RedTeamPanel } from "@/features/red-team/RedTeamPanel";
import { shortAddress } from "@/shared/web3/walletStatus";

interface Slot {
  name: string;
  task: string;
  note: string;
  /**
   * `data-tour` anchor for the /demo guided tour (app/tour/tourSteps.ts). Keep the same value on
   * the real panel that replaces this slot, or the tour falls back to a centered card.
   */
  tour?: string;
  /** Real panel that replaced this placeholder; rendered instead of the dashed slot. */
  panel?: (props: { mode: "demo" | "owner"; safe: Address | null }) => ReactNode;
}

interface Column {
  id: string;
  index: string;
  title: string;
  slots: Slot[];
}

/** Layout of ui-pages §4.1. Each slot names the task that will fill it, so nothing here pretends to be live data. */
const COLUMNS: Column[] = [
  {
    id: "panel-owner",
    index: "01",
    title: "Owner",
    slots: [
      { name: "Policy status", task: "L7", note: "Per-transaction cap, daily cap, expiry: read straight from the contract.", tour: "policy" },
      { name: "Edit policy", task: "L7", note: "The owner signs setPolicy in their wallet, never through the backend.", tour: "policy" },
      { name: "Kill-Switch", task: "L7", note: "One revoke transaction signed in the wallet, with the measured lock time.", tour: "kill-switch" },
      { name: "Deposit / withdraw", task: "L8", note: "Move tokens into the Safe or back to the owner wallet." },
    ],
  },
  {
    id: "panel-activity",
    index: "02",
    title: "Vault & activity",
    slots: [
      { name: "Balances before / after", task: "L8", note: "Safe balances before and after the latest transaction.", tour: "balances" },
      { name: "Daily cap used", task: "L8", note: "Spent / daily cap, read from the chain.", tour: "balances" },
      {
        name: "Job timeline",
        task: "Q9",
        note: "Shield 1 → Shield 2, explanation card, Snowtrace link.",
        tour: "activity",
        panel: ({ safe }) => <ActivityPanel safe={safe} />,
      },
    ],
  },
  {
    id: "panel-redteam",
    index: "03",
    title: "Red-team",
    slots: [
      {
        // The panel carries the redteam-rebalance and redteam-attacks tour anchors itself.
        name: "Red-team",
        task: "Q10",
        note: "Run rebalance, 4 attacks and the prompt injection box.",
        panel: ({ safe }) => <RedTeamPanel safe={safe} />,
      },
    ],
  },
];

interface VaultDashboardPlaceholderProps {
  mode: "demo" | "owner";
  /** Null for the public demo vault until its Fuji address exists (L4). */
  safe: Address | null;
}

/** Honest skeleton of the shared VaultDashboard (/demo = mode "demo", /vaults/:safe = mode "owner"). */
export function VaultDashboardPlaceholder({ mode, safe }: VaultDashboardPlaceholderProps) {
  const explorer = FUJI.blockExplorers.default.url;
  return (
    <>
      <section className="blueprint border-b border-line">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
          <div data-tour="vault-header">
            <Chamfer code={mode === "demo" ? "VAULT / DEMO" : "VAULT / OWNER"} ground="vault-header" innerClassName="p-5 pb-9 sm:p-8 sm:pb-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="mono-label">{mode === "demo" ? "Public demo vault · no wallet needed" : "Vault dashboard"}</span>
                <Stamp tone="warn">No live data yet</Stamp>
              </div>
              <h1 className="mt-4 text-4xl font-black leading-none sm:text-5xl">{mode === "demo" ? "Demo vault" : "Vault"}</h1>
              {safe ? (
                <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-sm" title={safe}>
                    <span className="hidden sm:inline">{safe}</span>
                    <span className="sm:hidden">{shortAddress(safe)}</span>
                  </span>
                  <a
                    href={`${explorer}/address/${safe}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-accent-text hover:underline"
                  >
                    Snowtrace <ArrowUpRight aria-hidden className="size-4" />
                  </a>
                </p>
              ) : (
                <p className="mt-4 text-soft">The demo vault address appears once it is deployed on Avalanche Fuji.</p>
              )}
            </Chamfer>
          </div>

          <div className="mt-8 flex items-start gap-3 border border-on-accent bg-highlight p-4 text-on-accent">
            <Construction aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2.5} />
            <p className="font-bold">
              This page is under construction. There are no figures here yet: balances, policy and job history appear once the Fuji
              contracts and the vault API are ready.
              {mode === "demo" ? " Visitors to the demo vault do not need a wallet." : " Owner buttons only appear when the connected wallet owns the Safe."}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-3">
        {COLUMNS.map((col) => (
          <div key={col.id} data-ground={col.id} className="border border-line bg-surface p-5 shadow-hard">
            <span className="mono-label">
              {col.index} · {col.title}
            </span>
            <ul className="mt-4 space-y-3">
              {col.slots.map((slot) =>
                slot.panel ? (
                  <li key={slot.name} data-tour={slot.tour}>
                    {slot.panel({ mode, safe })}
                  </li>
                ) : (
                  <li key={slot.name} data-tour={slot.tour} className="border border-dashed border-line-strong p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-bold">{slot.name}</span>
                      <span className="font-mono text-[11px] uppercase tracking-widest text-muted">Not wired yet · {slot.task}</span>
                    </div>
                    <p className="mt-1 text-sm text-soft">{slot.note}</p>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
