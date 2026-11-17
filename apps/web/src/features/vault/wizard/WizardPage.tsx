import { Check, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Footer } from "@/shared/shell/Footer";
import { Header } from "@/shared/shell/Header";
import { cn } from "@/shared/lib/cn";
import { sameAddress, shortAddress } from "@/shared/lib/address";
import { confirmationsLeft } from "@/shared/lib/wizard";
import { useSession } from "@/shared/session/sessionStore";
import { NetworkGuard } from "@/shared/ui/NetworkGuard";
import { Skeleton } from "@/shared/ui/Skeleton";
import {
  completedSteps,
  decideWizardStep,
  firstIncompleteStep,
  isWizardStep,
  STEP_LABEL,
  WIZARD_STEPS,
  wizardPath,
  type WizardStep,
} from "../guards/wizard";
import { Breadcrumb } from "../layout/Breadcrumb";
import { useWizardControl, type WizardControl } from "../hooks/useWizardControl";
import { RouteNotice } from "../layout/RouteNotice";
import { BlockedStep, DoneStep, FundStep, ModuleStep, PolicyStep, SafeStep } from "./WizardSteps";

function StepBody({ step, control, readOnly }: { step: WizardStep; control: WizardControl; readOnly: boolean }) {
  switch (step) {
    case "safe":
      return <SafeStep control={control} readOnly={readOnly} />;
    case "module":
      return <ModuleStep control={control} readOnly={readOnly} />;
    case "policy":
      return <PolicyStep control={control} readOnly={readOnly} />;
    case "fund":
      return <FundStep control={control} />;
  }
}

function Stepper({ done, current }: { done: Record<WizardStep, boolean>; current: WizardStep | null }) {
  return (
    <ol aria-label="Vault setup steps" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {WIZARD_STEPS.map((s, i) => {
        const isDone = done[s];
        const isCurrent = s === current;
        const locked = !isDone && !isCurrent;
        return (
          <li key={s}>
            <Link
              to={wizardPath(s)}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex min-h-14 items-center gap-3 border px-3 py-2",
                isCurrent ? "border-accent bg-surface shadow-hard-sm" : "border-line bg-bg",
                locked ? "text-muted" : "text-fg hover:bg-hover",
              )}
            >
              <span className={cn("inline-flex size-7 shrink-0 items-center justify-center font-mono text-xs font-bold", isDone ? "bg-accent text-on-accent" : "border border-line-strong")}>
                {isDone ? <Check aria-hidden strokeWidth={3} className="size-4" /> : locked ? <Lock aria-hidden className="size-3.5" /> : `0${i + 1}`}
              </span>
              <span className="font-mono text-xs font-bold uppercase tracking-widest">{STEP_LABEL[s]}</span>
              <span className="sr-only">{isDone ? "(done)" : isCurrent ? "(current step)" : "(locked)"}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * /vaults/new and /vaults/new/:step. Progress is recomputed from the chain on every visit (P1); the URL only says
 * which step the user is LOOKING at, and the guard sends them back if that step is not open yet. Each step is a
 * transaction signed in the owner's wallet (P2).
 */
export function WizardPage() {
  const { step: stepParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const wallet = useSession((s) => s.wallet);
  const control = useWizardControl(wallet?.address ?? null);

  // Leaving the wizard (open the vault, start over) forgets the Safe; until the new URL renders, show nothing rather
  // than let the guard react to the now-empty wizard and redirect somewhere else.
  const [leavingFrom, setLeavingFrom] = useState<string | null>(null);
  const leave = (to: string, state?: { notice: string }) => {
    setLeavingFrom(location.key);
    control.forget();
    navigate(to, { replace: true, state });
  };

  const owner = control.owner ?? wallet?.address ?? null;
  const done = completedSteps(owner, control.guard);
  const first = firstIncompleteStep(done);

  // When the step being worked on is confirmed on-chain, move on to the next one by itself.
  const lastFirst = useRef(first);
  useEffect(() => {
    const before = lastFirst.current;
    lastFirst.current = first;
    if (control.status !== "ready" || before === first || before !== stepParam) return;
    if (first && WIZARD_STEPS.indexOf(first) > WIZARD_STEPS.indexOf(before)) navigate(wizardPath(first), { replace: true });
  }, [first, stepParam, control.status, navigate]);

  // Not signed in: go through the gate, then come back to exactly this URL.
  if (!wallet) return <Navigate to="/signin" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;

  const body = () => {
    if (leavingFrom === location.key) return null;
    if (control.status === "loading") return <Skeleton className="h-64 w-full" />;
    if (control.status === "unavailable") {
      return (
        <div role="alert" className="border-l-4 border-danger bg-tint-pink px-4 py-3 text-sm">
          Could not read this Safe from the Fuji chain. Check your connection; the page retries by itself.
        </div>
      );
    }
    const startOver = () => leave(wizardPath("safe"));
    if (control.blocker) return <BlockedStep control={control} onStartOver={startOver} />;

    // Everything confirmed on-chain: hand over to the vault page once the server serves it.
    if (first === null && control.safe) {
      const safe = control.safe;
      return <DoneStep control={control} onOpen={() => leave(`/vaults/${safe}`, { notice: "Your vault is ready." })} onStartOver={startOver} />;
    }

    // /vaults/new or an unknown step name -> the first step that still needs doing.
    if (!isWizardStep(stepParam)) return <Navigate to={wizardPath(first ?? "safe")} replace />;

    const decision = decideWizardStep(stepParam, done);
    if (decision.kind === "redirect") return <Navigate to={decision.to} replace state={{ notice: decision.notice }} />;

    return (
      <>
        <RouteNotice />
        <StepBody step={stepParam} control={control} readOnly={decision.readOnly} />
      </>
    );
  };

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <NetworkGuard />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <Breadcrumb items={[{ label: "Vaults", to: "/vaults" }, { label: "Create vault" }]} />
        <div>
          <h1 className="text-3xl">Create vault</h1>
          {control.status !== "loading" && first !== null && (
            <p className="mt-1 text-sm text-muted">
              About {confirmationsLeft(control.facts, Math.floor(Date.now() / 1000))} wallet confirmations left. Each one is a Fuji testnet transaction.
            </p>
          )}
        </div>
        <Stepper done={done} current={first} />
        {control.owner && !sameAddress(control.owner, wallet.address) && (
          <div role="status" className="border-l-4 border-warn bg-tint-amber px-4 py-3 text-sm">
            Your wallet is set to {shortAddress(control.owner)}, not the signed-in account {shortAddress(wallet.address)}. The vault will belong to{" "}
            {shortAddress(control.owner)}; switch accounts in your wallet if that is not what you want.
          </div>
        )}
        {body()}
      </main>
      <Footer />
    </div>
  );
}
