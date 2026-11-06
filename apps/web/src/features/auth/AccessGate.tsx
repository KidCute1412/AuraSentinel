import { useEffect, useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Mail, Wallet } from "lucide-react";
import { Header } from "@/features/landing/Header";
import { Chamfer } from "@/shared/ui/Chamfer";
import { cn } from "@/shared/lib/cn";
import { react } from "@/shared/mascot/mascotStore";
import { LINES } from "@/shared/mascot/lines";
import { EmailPanel } from "./EmailPanel";
import { GateDoor } from "./GateDoor";
import { WalletPanel, type GateMode } from "./WalletPanel";
import { initialPhase, reduce, stageOf } from "./gateFlow";

const COPY: Record<GateMode, { title: string; lead: string }> = {
  signin: { title: "Show your badge.", lead: "Your wallet is your account. No password to lose." },
  signup: { title: "Get your badge.", lead: "Connect a wallet and you're in. The agent never touches your keys." },
};

export function AccessGate({ mode }: { mode: GateMode }) {
  const [phase, dispatch] = useReducer(reduce, initialPhase);
  const [method, setMethod] = useState<"wallet" | "email">("wallet");
  const copy = COPY[mode];

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

  const tab = (to: string, label: string, on: boolean) => (
    <Link to={to} aria-current={on ? "page" : undefined} className={cn("flex h-11 flex-1 items-center justify-center font-mono text-xs font-bold uppercase tracking-widest", on ? "bg-fg text-bg" : "bg-hover text-soft hover:text-fg")}>
      {label}
    </Link>
  );
  const methodBtn = (id: "wallet" | "email", label: string, Icon: typeof Wallet) => (
    <button type="button" aria-pressed={method === id} onClick={() => setMethod(id)} className={cn("flex h-10 items-center gap-2 px-3 font-mono text-xs font-bold uppercase tracking-widest", method === id ? "border-b-2 border-accent text-fg" : "border-b-2 border-transparent text-muted hover:text-fg")}>
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <main className="blueprint relative overflow-hidden border-b border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-24 pt-28 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:pt-32">
          <div className="order-2 min-w-0 lg:order-1">
            <Chamfer code="ACCESS-01" ground="gate-card" innerClassName="p-5 pb-9 sm:p-8 sm:pb-10">
              <div className="flex border border-line-strong">
                {tab("/signin", "Sign in", mode === "signin")}
                {tab("/signup", "Sign up", mode === "signup")}
              </div>
              <h1 className="mt-6 text-4xl font-black italic uppercase leading-[0.95] tracking-[-0.04em] sm:text-5xl">
                <span className="outline-text">{copy.title}</span>
              </h1>
              <p className="mt-3 text-soft">{copy.lead}</p>

              <div className="mt-6 flex gap-2 border-b border-line">
                {methodBtn("wallet", "Wallet", Wallet)}
                {methodBtn("email", "Email", Mail)}
              </div>
              <div className="mt-6">
                {method === "wallet" ? (
                  <WalletPanel mode={mode} phase={phase} dispatch={dispatch} />
                ) : (
                  <EmailPanel mode={mode} onUseWallet={() => setMethod("wallet")} />
                )}
              </div>

              <div className="mt-6 border-t border-line pt-4 text-sm text-soft">
                <Link to="/demo" className="inline-flex items-center gap-2 font-bold hover:text-accent-text">
                  Just looking? Try the demo, no wallet needed
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
            </Chamfer>
          </div>

          <div className="order-1 mx-auto w-full max-w-[17rem] lg:order-2 lg:max-w-md" data-ground="gate-door">
            <GateDoor stage={stageOf(phase)} denied={phase.kind === "denied"} />
          </div>
        </div>
      </main>
    </div>
  );
}
