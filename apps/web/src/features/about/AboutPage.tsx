import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Bot, Brain, Calculator, FileCheck2, KeyRound, Landmark, Link2, ShieldCheck, Skull, Users } from "lucide-react";
import { Header } from "@/shared/shell/Header";
import { Footer } from "@/shared/shell/Footer";
import { primaryCta, secondaryCta } from "@/shared/ui/cta";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";
import { Reveal } from "@/shared/ui/Reveal";
import { AttackSimulator } from "./AttackSimulator";
import { react } from "@/shared/mascot/mascotStore";
import { LINES } from "@/shared/mascot/lines";

const LAYERS = [
  { icon: Bot, tag: "The agent", title: "Trades 24/7", body: "Holds a limited session key. It can propose swaps. It can never withdraw to itself.", edge: "bg-line-strong", fill: "bg-surface" },
  { icon: ShieldCheck, tag: "Shield 1 · off-chain", title: "AI Auditor", body: "Simulates every trade on a forked chain before signing. Rejects anything outside the rules.", edge: "bg-accent", fill: "bg-tint-mint" },
  { icon: FileCheck2, tag: "Shield 2 · on-chain", title: "Policy module", body: "Whitelist, per-tx cap, daily cap, locked recipient. The contract reverts violations even if Shield 1 is fooled.", edge: "bg-accent", fill: "bg-tint-mint" },
  { icon: Landmark, tag: "The vault", title: "A Safe you own", body: "Funds never leave it except to itself. Only the owner can change rules or pull the plug.", edge: "bg-line-strong", fill: "bg-surface" },
];

const PRINCIPLES = [
  { icon: Link2, title: "The chain is the truth", body: "Policy and spend state live on-chain. Our database never mirrors them, so it can never disagree with reality." },
  { icon: KeyRound, title: "You hold the kill switch", body: "Kill-Switch and rule changes are signed in your browser by your wallet. Our backend cannot do either." },
  { icon: Calculator, title: "Math decides, not AI", body: "Verdicts, amounts and signing are deterministic code. No model is ever in the approval path." },
  { icon: Skull, title: "One narrow key", body: "Only the execution module touches the agent's session key, and it can only call the policy module." },
];

const TEAM = [
  { code: "FS1", role: "Vault & lock", body: "Solidity policy module, fuzz and invariant tests, Fuji deployment." },
  { code: "FS2", role: "Web, queue & fork", body: "Dashboard, BullMQ workers, Anvil fork simulation, Docker stack." },
  { code: "AIE", role: "AI & red team", body: "Gemini explainer with template fallback, four attack scenarios." },
];

export function AboutPage() {
  useEffect(() => {
    react("happy", { text: LINES.about, hold: 2200, passive: true });
  }, []);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />

      <section className="blueprint relative overflow-hidden border-b border-line">
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-6 lg:pt-28">
          <span className="mono-label">ABOUT / AGENTSHIELD</span>
          <h1 className="mt-4 text-5xl font-black italic uppercase leading-[0.92] tracking-[-0.04em] sm:text-7xl lg:text-8xl">
            Give the agent
            <span className="outline-text block">a leash,</span>
            <span className="block">not the keys.</span>
          </h1>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <p className="max-w-xl text-lg text-soft">
              AI agents can trade around the clock, but nobody should hand one the keys to a wallet. AgentShield lets an
              agent work inside rules that the blockchain itself enforces.
            </p>
            <span className="rotate-3 bg-highlight px-3 py-1 font-mono text-sm font-bold uppercase tracking-widest text-ink">
              Built on Avalanche Fuji
            </span>
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <span className="mono-label">01 · The problem</span>
            <h2 className="mt-2 text-3xl md:text-4xl">Autonomy and custody don&apos;t mix.</h2>
            <p className="mt-4 text-soft">
              Either the agent holds funds and one prompt injection empties them, or a human approves every trade and the
              agent is no longer autonomous. We remove the trade-off: the agent can act, but only inside a box it cannot open.
            </p>
          </div>
          <div className="lg:col-span-8">
            <div aria-hidden className="relative mb-6 hidden h-6 md:block">
              <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-line-strong" />
              <span className="animate-packet-ok absolute top-1/2 size-3 -translate-y-1/2 bg-accent" />
              <span className="animate-packet-bad absolute top-1/2 size-3 -translate-y-1/2 bg-danger" />
            </div>
            <ol className="grid gap-4 md:grid-cols-2">
              {LAYERS.map(({ icon: Icon, tag, title, body, edge, fill }, i) => (
                <li key={title}>
                  <Reveal delay={i * 60}>
                    <Chamfer tilt edge={edge} fill={fill} code={`LAYER 0${i + 1}`} innerClassName="p-5 pb-9">
                      <Icon aria-hidden className="size-6 text-accent-text" />
                      <span className="mono-label mt-3 block">{tag}</span>
                      <h3 className="mt-1 text-xl">{title}</h3>
                      <p className="mt-2 text-sm text-soft">{body}</p>
                    </Chamfer>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <span className="mono-label">02 · Try to break it</span>
          <h2 className="mt-2 text-3xl md:text-4xl">Pick an attack. See who stops it.</h2>
          <p className="mt-4 max-w-2xl text-soft">
            Four transactions, two shields. Some die at the auditor, one slips past it and still gets reverted by the contract.
          </p>
          <div className="mt-10">
            <AttackSimulator />
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <span className="mono-label">03 · Math vs. AI</span>
          <h2 className="mt-2 text-3xl md:text-4xl">The AI explains. It never decides.</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Reveal>
              <Chamfer edge="bg-accent" fill="bg-tint-mint" code="DETERMINISTIC" innerClassName="p-6 pb-10">
                <Calculator aria-hidden className="size-7 text-accent-text" />
                <h3 className="mt-3 text-2xl">Code decides</h3>
                <ul className="mt-3 grid gap-2 text-soft">
                  <li>Verdict: approve or block</li>
                  <li>Amounts, in integer base units</li>
                  <li>Signing with the session key</li>
                </ul>
                <div className="mt-4"><Stamp tone="ok">Reproducible</Stamp></div>
              </Chamfer>
            </Reveal>
            <Reveal delay={80}>
              <Chamfer code="LANGUAGE ONLY" innerClassName="p-6 pb-10">
                <Brain aria-hidden className="size-7 text-soft" />
                <h3 className="mt-3 text-2xl">The model talks</h3>
                <ul className="mt-3 grid gap-2 text-soft">
                  <li>Writes the plain-language explanation</li>
                  <li>Falls back to a template after 2 seconds</li>
                  <li>Cannot change a verdict or an amount</li>
                </ul>
                <div className="mt-4"><Stamp tone="warn">Advisory</Stamp></div>
              </Chamfer>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <span className="mono-label">04 · Principles</span>
          <h2 className="mt-2 text-3xl md:text-4xl">Four rules we don&apos;t bend.</h2>
          <ul className="mt-10 grid gap-5 md:grid-cols-2">
            {PRINCIPLES.map(({ icon: Icon, title, body }, i) => (
              <li key={title}>
                <Reveal delay={i * 50} className="h-full">
                  <div className="flex h-full gap-4 border border-line bg-surface p-5 shadow-hard">
                    <span className="tabular text-3xl font-black text-accent-text">0{i + 1}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <Icon aria-hidden className="size-5 text-accent-text" />
                        <h3 className="text-lg">{title}</h3>
                      </div>
                      <p className="mt-2 text-sm text-soft">{body}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <span className="mono-label">05 · The team</span>
            <h2 className="mt-2 text-3xl md:text-4xl">Three people, three weeks.</h2>
            <p className="mt-4 flex items-center gap-2 text-soft">
              <Users aria-hidden className="size-4 shrink-0" />
              Team 1 · Vietnam UniHack 2026
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-3 lg:col-span-8">
            {TEAM.map((m, i) => (
              <li key={m.code}>
                <Reveal delay={i * 60} className="h-full">
                  <Chamfer tilt code={m.code} innerClassName="p-5 pb-9">
                    <span className="tabular text-3xl font-black">{m.code}</span>
                    <h3 className="mt-2 text-lg">{m.role}</h3>
                    <p className="mt-2 text-sm text-soft">{m.body}</p>
                  </Chamfer>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-16 sm:px-6">
          <h2 className="text-3xl md:text-4xl">Don&apos;t take our word for it.</h2>
          <div className="flex flex-wrap gap-4">
            <span className="drop-hard"><Link to="/proof" className={primaryCta}>See the proof</Link></span>
            <span className="drop-hard"><Link to="/signin" className={secondaryCta}>Sign in</Link></span>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
