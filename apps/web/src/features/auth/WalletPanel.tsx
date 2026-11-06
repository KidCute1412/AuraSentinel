import { Link } from "react-router-dom";
import { Stamp } from "@/shared/ui/Stamp";
import { cn } from "@/shared/lib/cn";
import { primaryCta, secondaryCta } from "@/features/landing/cta";
import { Identicon } from "./identity";
import { activeStep, MOCK_ADDRESS, shortAddress, type Action, type Phase, type Step, type WalletId } from "./gateFlow";

export type GateMode = "signin" | "signup";

const WALLETS: { id: WalletId; label: string }[] = [
  { id: "core", label: "Core" },
  { id: "metamask", label: "MetaMask" },
];

const STEPS: { id: Step; label: string }[] = [
  { id: "connect", label: "Connect" },
  { id: "sign", label: "Sign" },
  { id: "verify", label: "Verify" },
];
const ORDER: Step[] = ["connect", "sign", "verify", "done"];

const SIWE = (address: string) =>
  `agentshield.app wants you to sign in with your Avalanche account:\n${address}\n\nSign in to AgentShield. This does not move funds.\n\nChain ID: 43113 (Fuji)\nNonce: 8f3a91c2`;

interface Props {
  mode: GateMode;
  phase: Phase;
  dispatch: (a: Action) => void;
}

export function WalletPanel({ mode, phase, dispatch }: Props) {
  const current = ORDER.indexOf(activeStep(phase));
  return (
    <div>
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.id} className={cn("border-t-4 pt-2 font-mono text-xs uppercase tracking-widest", done ? "border-accent text-accent-text" : active ? "border-fg text-fg" : "border-line text-muted")}>
              <span className="tabular">0{i + 1}</span> {s.label}
              <span className="sr-only">{done ? " done" : active ? " current" : ""}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 min-h-[15rem]" aria-live="polite">
        {(phase.kind === "idle" || phase.kind === "denied") && (
          <div>
            {phase.kind === "denied" && (
              <div className="mb-4 flex flex-wrap items-center gap-3 border border-danger bg-tint-pink p-3">
                <Stamp tone="danger" animate>Signature refused</Stamp>
                <span className="text-sm text-soft">Nothing was signed and no funds moved.</span>
              </div>
            )}
            <p className="text-soft">
              {mode === "signin" ? "Pick the wallet that owns your vault." : "Pick a wallet. It becomes your account and signs the Kill-Switch."}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {WALLETS.map((w) => (
                <span key={w.id} className="drop-hard block">
                  <button type="button" onClick={() => dispatch({ type: "pick", wallet: w.id })} className={cn(secondaryCta, "w-full")}>
                    {w.label}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {phase.kind === "connecting" && (
          <p className="font-mono text-sm text-soft">
            Waiting for {phase.wallet === "core" ? "Core" : "MetaMask"}<span className="animate-pulse">…</span>
          </p>
        )}

        {phase.kind === "connected" && (
          <div>
            <div className="flex items-center gap-4">
              <Identicon address={MOCK_ADDRESS} />
              <div className="min-w-0">
                <div className="font-mono text-base font-bold">{shortAddress(MOCK_ADDRESS)}</div>
                <div className="mono-label">Avalanche Fuji · connected</div>
              </div>
            </div>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words border border-line-strong bg-bg p-3 font-mono text-xs leading-relaxed text-soft">{SIWE(shortAddress(MOCK_ADDRESS))}</pre>
            <p className="mt-2 text-sm text-muted">Free. No gas, no transfer. It only proves the wallet is yours.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <span className="drop-hard"><button type="button" onClick={() => dispatch({ type: "sign" })} className={primaryCta}>Sign message</button></span>
              <span className="drop-hard"><button type="button" onClick={() => dispatch({ type: "reject" })} className={secondaryCta}>Reject</button></span>
            </div>
          </div>
        )}

        {phase.kind === "verifying" && (
          <div>
            <p className="font-mono text-sm text-soft">Checking Safe owners on-chain<span className="animate-pulse">…</span></p>
            <div className="mt-4 h-2 border border-line-strong"><div className="hazard hazard-move h-full w-full" /></div>
          </div>
        )}

        {phase.kind === "done" && (
          <div>
            <div className="flex items-center gap-4">
              <Identicon address={MOCK_ADDRESS} />
              <div className="min-w-0">
                <div className="font-mono text-base font-bold">{shortAddress(MOCK_ADDRESS)}</div>
                <div className="mt-1"><Stamp tone="ok" animate>{mode === "signin" ? "Owner verified" : "New wallet"}</Stamp></div>
              </div>
            </div>
            <h2 className="mt-5 text-2xl">{mode === "signin" ? "Welcome back." : "Badge issued."}</h2>
            <p className="mt-1 text-soft">
              {mode === "signin" ? "Your vault is where you left it." : "Next, create a vault. The agent gets a leash, you keep the key."}
            </p>
            {/* TODO(auth): branch on Safe.getOwners(address) instead of the page mode. */}
            <div className="mt-5 flex flex-wrap gap-3">
              <span className="drop-hard">
                <Link to={mode === "signin" ? "/demo" : "/vaults/new"} className={primaryCta}>
                  {mode === "signin" ? "Open dashboard" : "Create your first vault"}
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
