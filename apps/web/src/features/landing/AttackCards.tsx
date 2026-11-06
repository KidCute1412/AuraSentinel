import { Ban, Globe, Infinity as InfinityIcon, UserX, type LucideIcon } from "lucide-react";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";

const attacks: { icon: LucideIcon; title: string; body: string; code: string }[] = [
  { icon: Ban, title: "Over-withdraw", body: "Tries to move more than the daily cap.", code: "ExceedsPerTxCap" },
  { icon: UserX, title: "Wrong recipient", body: "Sends funds outside the whitelist.", code: "RecipientLocked" },
  { icon: InfinityIcon, title: "Unlimited approval", body: "Requests an infinite allowance.", code: "UnlimitedApproval" },
  { icon: Globe, title: "Bypass website", body: "Skips the app, calls the contract directly.", code: "reverted on-chain" },
];

export function AttackCards() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <span className="mono-label">02 · Red team</span>
          <h2 className="mt-2 text-3xl md:text-4xl">4 real attacks. 4 blocks.</h2>
          <p className="mt-4 text-soft">
            Run each one yourself in the demo. Every attack ends in a reason
            code, never in lost funds.
          </p>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2 lg:col-span-8">
          {attacks.map(({ icon: Icon, title, body, code }, i) => (
            <li key={title} className={i % 2 === 1 ? "sm:translate-y-6" : ""}>
              <Chamfer edge="bg-line-strong" fill="bg-surface" code={`ATK-0${i + 1}`} innerClassName="p-5 pb-9">
                <div className="flex items-center justify-between">
                  <Icon aria-hidden className="size-6" />
                  <Stamp tone="danger">Blocked</Stamp>
                </div>
                <h3 className="mt-4 border-l-4 border-danger pl-3 text-xl">{title}</h3>
                <p className="mt-2 pl-4 text-soft">{body}</p>
                <span className="tabular mt-4 block pl-4 text-xs text-danger-text">{code}</span>
              </Chamfer>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
