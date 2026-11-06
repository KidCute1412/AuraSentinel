import { useEffect, useReducer } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Globe, KeyRound, ShieldCheck } from "lucide-react";
import { Header } from "@/features/landing/Header";
import { Footer } from "@/features/landing/Footer";
import { cn } from "@/shared/lib/cn";
import { Chamfer } from "@/shared/ui/Chamfer";
import { react } from "@/shared/mascot/mascotStore";
import { LINES } from "@/shared/mascot/lines";
import { GateDoor } from "./GateDoor";
import { WalletPanel } from "./WalletPanel";
import { initialPhase, reduce, stageOf, type Phase } from "./gateFlow";

const LEAD: Record<Phase["kind"], string> = {
  idle: "Your wallet is your account. No password to lose.",
  connecting: "Check your wallet app.",
  connected: "Almost there. Prove the wallet is yours.",
  verifying: "Making sure you hold the keys.",
  done: "You're in.",
  denied: "No problem. Try again whenever.",
};

const STATUS: Record<Phase["kind"], string> = {
  idle: "AWAITING BADGE",
  connecting: "CONNECTING WALLET",
  connected: "AWAITING SIGNATURE",
  verifying: "VERIFYING OWNER",
  done: "ACCESS GRANTED",
  denied: "ACCESS REFUSED",
};

const TRUST = [
  { icon: ShieldCheck, text: "Signing moves no funds" },
  { icon: KeyRound, text: "Your key never leaves your wallet" },
  { icon: Globe, text: "Avalanche Fuji testnet" },
];

/** One screen for sign in and sign up: the wallet decides which one it is. */
export function AccessGate() {
  const [phase, dispatch] = useReducer(reduce, initialPhase);

  // UI-only simulation of the wallet round-trips. Replace with wagmi + SIWE later.
  useEffect(() => {
    if (phase.kind === "connecting") {
      react("guard", { text: LINES.gate.connect, hold: 1800, passive: true });
      const t = setTimeout(() => dispatch({ type: "connected" }), 900);
      return () => clearTimeout(t);
    }
    if (phase.kind === "connected") react("guard", { text: LINES.gate.sign, hold: 2000, passive: true });
    if (phase.kind === "verifying") {
      react("guard", { text: LINES.gate.verify, hold: 1400, passive: true });
      const t = setTimeout(() => dispatch({ type: "verified" }), 1500);
      return () => clearTimeout(t);
    }
    if (phase.kind === "done") react("happy", { text: LINES.gate.ok, hold: 2500, passive: true });
    if (phase.kind === "denied") react("annoyed", { text: LINES.gate.refused, hold: 2500 });
  }, [phase.kind]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <main className="blueprint relative overflow-hidden border-b border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-24 pt-28 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:pt-32">
          <div className="order-2 min-w-0 lg:order-1">
            <Chamfer
              code="ACCESS-01"
              ground="gate-card"
              edge={phase.kind === "denied" ? "bg-danger" : phase.kind === "done" ? "bg-accent" : "bg-line-strong"}
              innerClassName="p-5 pb-9 sm:p-8 sm:pb-10"
            >
              <span className="mono-label flex items-center gap-2">
                <span aria-hidden className={cn("size-2", phase.kind === "denied" ? "bg-danger" : phase.kind === "idle" ? "bg-muted" : "bg-accent", phase.kind !== "idle" && phase.kind !== "denied" && phase.kind !== "done" && "animate-pulse")} />
                STATUS: {STATUS[phase.kind]}
              </span>
              <h1 className="mt-3 text-5xl font-black italic uppercase leading-[0.92] tracking-[-0.04em] sm:text-6xl">
                <span className="outline-text">Show your</span>
                <span className="block">badge.</span>
              </h1>
              <p className="mt-4 text-lg text-soft">{LEAD[phase.kind]}</p>
              <div className="mt-6">
                <WalletPanel phase={phase} dispatch={dispatch} />
              </div>
              <div className="mt-6 border-t border-line pt-4 text-sm text-soft">
                <Link to="/demo" className="inline-flex items-center gap-2 font-bold hover:text-accent-text">
                  No wallet? Try the demo
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
            </Chamfer>
            <ul className="mt-8 grid gap-3 sm:grid-cols-3">
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2 border-l-2 border-accent pl-3 font-mono text-xs uppercase leading-snug tracking-wider text-soft">
                  <Icon aria-hidden className="mt-px size-4 shrink-0 text-accent-text" />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <div className="order-1 mx-auto w-full max-w-[16rem] lg:order-2 lg:max-w-md" data-ground="gate-door">
            <GateDoor
              stage={stageOf(phase)}
              denied={phase.kind === "denied"}
              busy={phase.kind === "connecting" || phase.kind === "verifying"}
              onOverspin={() => react("whoa", { text: LINES.gate.spin, hold: 1200 })}
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
