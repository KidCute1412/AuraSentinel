import { useEffect, useReducer } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Header } from "@/features/landing/Header";
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
            <Chamfer code="ACCESS-01" ground="gate-card" innerClassName="p-5 pb-9 sm:p-8 sm:pb-10">
              <h1 className="text-4xl font-black italic uppercase leading-[0.95] tracking-[-0.04em] sm:text-5xl">
                <span className="outline-text">Show your badge.</span>
              </h1>
              <p className="mt-3 text-soft">{LEAD[phase.kind]}</p>
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
    </div>
  );
}
