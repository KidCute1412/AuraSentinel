import { Bot, FileCheck2, Landmark, ShieldCheck } from "lucide-react";
import { Chamfer } from "@/shared/ui/Chamfer";

const steps = [
  { icon: Bot, label: "Agent", title: "Proposes a trade", body: "Holds only a limited session key. Never the owner key.", edge: "bg-line-strong", fill: "bg-surface", offset: "" },
  { icon: ShieldCheck, label: "Shield 1 · off-chain", title: "AI Auditor", body: "Simulates every transaction before signing. The verdict is deterministic; the LLM only explains it.", edge: "bg-accent", fill: "bg-tint-mint", offset: "md:translate-y-8" },
  { icon: FileCheck2, label: "Shield 2 · on-chain", title: "Policy contract", body: "Even if Shield 1 is fooled, whitelist, daily cap and recipient rules revert violations on-chain.", edge: "bg-accent", fill: "bg-tint-mint", offset: "md:translate-y-16" },
  { icon: Landmark, label: "Vault", title: "Funds stay put", body: "A Safe vault you own. Recipients are locked to the vault itself.", edge: "bg-line-strong", fill: "bg-surface", offset: "md:translate-y-24" },
];

export function TwoShields() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <span className="mono-label">01 · How it works</span>
          <h2 className="mt-2 text-3xl md:text-4xl">Two shields. Both must say yes.</h2>
          <p className="mt-4 text-soft">
            A trade reaches the vault only after passing the off-chain auditor
            and the on-chain policy. Fail either one and nothing moves.
          </p>
          <p className="mono-label mt-6 hidden md:block" aria-hidden>
            <span className="text-accent-text">■</span> valid trade passes ·{" "}
            <span className="text-danger-text">■</span> attack dies at the gate
          </p>
        </div>
        <div className="lg:col-span-8">
          {/* Packet rail: decorative, desktop only. */}
          <div aria-hidden className="relative mb-6 hidden h-6 md:block">
            <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-line-strong" />
            <span className="animate-packet-ok absolute top-1/2 size-3 -translate-y-1/2 bg-accent" />
            <span className="animate-packet-bad absolute top-1/2 size-3 -translate-y-1/2 bg-danger" />
          </div>
          <ol className="grid gap-4 md:grid-cols-4 md:pb-24">
            {steps.map(({ icon: Icon, label, title, body, edge, fill, offset }, i) => (
              <li key={title} className={offset}>
                <Chamfer edge={edge} fill={fill} ground={`step-0${i + 1}`} code={`STEP 0${i + 1}`} innerClassName="p-4 pb-8">
                  <span className="tabular text-xs text-muted">0{i + 1}</span>
                  <Icon aria-hidden className="mt-2 size-6 text-accent-text" />
                  <span className="mono-label mt-3 block">{label}</span>
                  <h3 className="mt-1 text-lg">{title}</h3>
                  <p className="mt-2 text-sm text-soft">{body}</p>
                </Chamfer>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
