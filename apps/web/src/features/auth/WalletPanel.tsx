import { Link } from "react-router-dom";
import { Plug, Wallet, type LucideIcon } from "lucide-react";
import { Stamp } from "@/shared/ui/Stamp";
import { cn } from "@/shared/lib/cn";
import { primaryCta } from "@/features/landing/cta";
import { react } from "@/shared/mascot/mascotStore";
import { LINES } from "@/shared/mascot/lines";
import { HoldButton } from "./HoldButton";
import { Identicon } from "./identity";
import { activeStep, MOCK_ADDRESS, shortAddress, type Action, type Phase, type Step, type WalletId } from "./gateFlow";

const WALLETS: { id: WalletId; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "core", label: "Core", hint: "Built for Avalanche", icon: Wallet },
  { id: "metamask", label: "MetaMask", hint: "Browser extension", icon: Plug },
];

const STEPS: { id: Step; label: string }[] = [
  { id: "connect", label: "Connect" },
  { id: "sign", label: "Sign" },
  { id: "verify", label: "Verify" },
];
const ORDER: Step[] = ["connect", "sign", "verify", "done"];

const SIWE = (address: string) =>
  `agentshield.app wants you to sign in with your Avalanche account:\n${address}\n\nSign in to AgentShield. This does not move funds.\n\nChain ID: 43113 (Fuji)\nNonce: 8f3a91c2`;

/** Mock rule until Safe.getOwners is wired: MetaMask plays a brand-new wallet, Core a returning owner. */
export const isNewWallet = (w: WalletId): boolean => w === "metamask";

interface Props {
  phase: Phase;
  dispatch: (a: Action) => void;
}

export function WalletPanel({ phase, dispatch }: Props) {
  const current = ORDER.indexOf(activeStep(phase));
  return (
    <div>
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.id} className={cn("border-t-4 pt-2 font-mono text-xs uppercase tracking-widest transition-colors", done ? "border-accent text-accent-text" : active ? "border-fg text-fg" : "border-line text-muted")}>
              <span className="tabular">0{i + 1}</span> {s.label}
              <span className="sr-only">{done ? " done" : active ? " current" : ""}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 min-h-[13rem]" aria-live="polite">
        {(phase.kind === "idle" || phase.kind === "denied") && (
          <div className="animate-feed-in">
            {phase.kind === "denied" && (
              <div className="mb-4 flex flex-wrap items-center gap-3 border border-danger bg-tint-pink p-3">
                <Stamp tone="danger" animate>Signature refused</Stamp>
                <span className="text-sm text-soft">Nothing was signed. No funds moved.</span>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {WALLETS.map((w) => (
                <span key={w.id} className="drop-hard block">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "pick", wallet: w.id })}
                    className="chamfer flex w-full items-center gap-3 bg-hover p-4 text-left transition-transform duration-150 hover:-translate-x-px hover:-translate-y-px hover:bg-line active:translate-x-0 active:translate-y-0"
                  >
                    <w.icon aria-hidden className="size-6 shrink-0 text-accent-text" />
                    <span className="min-w-0">
                      <span className="block text-base font-bold">{w.label}</span>
                      <span className="mono-label block normal-case tracking-normal">{w.hint}</span>
                    </span>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {phase.kind === "connecting" && (
          <div className="animate-feed-in">
            <div className="flex items-center gap-4 border border-line-strong bg-bg p-4">
              <Wallet aria-hidden className="size-6 shrink-0 text-accent-text" />
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold">
                  Waiting for {phase.wallet === "core" ? "Core" : "MetaMask"}
                  <span aria-hidden className="animate-caret ml-1 inline-block h-4 w-2 translate-y-0.5 bg-accent" />
                </p>
                <p className="mono-label mt-1 normal-case tracking-normal">Approve the connection in the wallet popup.</p>
              </div>
            </div>
            <div className="mt-4 h-2 border border-line-strong"><div className="hazard hazard-move h-full w-full" /></div>
          </div>
        )}

        {phase.kind === "connected" && (
          <div className="animate-feed-in">
            <div className="flex items-center gap-4">
              <Identicon address={MOCK_ADDRESS} />
              <div className="min-w-0">
                <div className="font-mono text-base font-bold">{shortAddress(MOCK_ADDRESS)}</div>
                <div className="mono-label">Avalanche Fuji · connected</div>
              </div>
            </div>
            <p className="mt-4 text-soft">One signature. Free, no gas, no transfer.</p>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-bold text-accent-text">What am I signing?</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words border border-line-strong bg-bg p-3 font-mono text-xs leading-relaxed text-soft">{SIWE(shortAddress(MOCK_ADDRESS))}</pre>
            </details>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <HoldButton onStart={() => react("guard", { text: LINES.gate.hold, hold: 900 })} onComplete={() => dispatch({ type: "sign" })}>Hold to sign</HoldButton>
              <button type="button" onClick={() => dispatch({ type: "reject" })} className="font-mono text-xs uppercase tracking-widest text-muted hover:text-fg">Reject</button>
            </div>
          </div>
        )}

        {phase.kind === "verifying" && (
          <div className="animate-feed-in">
            <p className="font-mono text-sm text-soft">Checking Safe owners on-chain<span className="animate-pulse">…</span></p>
            <div className="mt-4 h-2 border border-line-strong"><div className="hazard hazard-move h-full w-full" /></div>
          </div>
        )}

        {phase.kind === "done" && (
          <div className="animate-feed-in">
            <div className="flex items-center gap-4">
              <Identicon address={MOCK_ADDRESS} />
              <div className="min-w-0">
                <div className="font-mono text-base font-bold">{shortAddress(MOCK_ADDRESS)}</div>
                <div className="mt-1"><Stamp tone="ok" animate>{isNewWallet(phase.wallet) ? "New wallet" : "Owner verified"}</Stamp></div>
              </div>
            </div>
            <h2 className="mt-5 text-2xl">{isNewWallet(phase.wallet) ? "Badge issued." : "Welcome back."}</h2>
            <p className="mt-1 text-soft">
              {isNewWallet(phase.wallet) ? "No vault yet. The agent gets a leash, you keep the key." : "Your vault is where you left it."}
            </p>
            {/* TODO(auth): branch on Safe.getOwners(address) instead of the mock rule. */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="drop-hard">
                <Link to={isNewWallet(phase.wallet) ? "/vaults/new" : "/demo"} className={primaryCta}>
                  {isNewWallet(phase.wallet) ? "Create your first vault" : "Open dashboard"}
                </Link>
              </span>
              <button type="button" onClick={() => dispatch({ type: "reset" })} className="h-12 px-2 font-mono text-xs uppercase tracking-widest text-muted hover:text-fg">
                Use another wallet
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
