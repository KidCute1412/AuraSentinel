import { Check, Lock } from "lucide-react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { Footer } from "@/shared/shell/Footer";
import { Header } from "@/shared/shell/Header";
import { useVaultView } from "@/shared/api/useVaultView";
import { cn } from "@/shared/lib/cn";
import { useSession } from "@/shared/session/sessionStore";
import { useWizardSafe } from "@/shared/session/wizardSafe";
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
import { RouteNotice } from "../layout/RouteNotice";
import { Placeholder } from "../pages/Placeholder";

const BLURB: Record<WizardStep, string> = {
  safe: "Pick a Safe you own or create a new one. Done when your wallet is an owner of that Safe.",
  module: "Deploy the AgentPolicyModule and enable it on the Safe. Done when the Safe reports the module as enabled.",
  policy: "Set the agent limits (per transaction, per day, expiry) and sign with your wallet. Done when the policy is active.",
  fund: "Get test tokens from the faucet and move them into the Safe. Done when the Safe balance is above zero.",
};

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
 * /vaults/new and /vaults/new/:step. Progress is recomputed from chain facts on every render; the URL only
 * says which step the user is LOOKING at, and the guard sends them back if that step is not open yet.
 */
export function WizardPage() {
  const { step: stepParam } = useParams();
  const location = useLocation();
  const wallet = useSession((s) => s.wallet);
  const safe = useWizardSafe((s) => s.safe);
  const { data: view, isPending } = useVaultView(safe);

  // Not signed in: go through the gate, then come back to exactly this URL.
  if (!wallet) return <Navigate to="/signin" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;

  const loading = !!safe && isPending;
  const facts = view ? { owners: view.owners, moduleEnabled: view.chain.moduleEnabled, policyActive: view.chain.policyActive, funded: view.chain.funded } : null;
  const done = completedSteps(wallet.address, facts);
  const first = firstIncompleteStep(done);

  const body = () => {
    if (loading) return <Skeleton className="h-64 w-full" />;

    // Wizard finished: nothing left to do here, open the vault.
    if (first === null && view) return <Navigate to={`/vaults/${view.safe}`} replace state={{ notice: "Your vault is ready." }} />;

    // /vaults/new or an unknown step name -> the first step that still needs doing.
    if (!isWizardStep(stepParam)) return <Navigate to={wizardPath(first ?? "safe")} replace />;

    const decision = decideWizardStep(stepParam, done);
    if (decision.kind === "redirect") return <Navigate to={decision.to} replace state={{ notice: decision.notice }} />;

    return (
      <>
        <RouteNotice />
        <Placeholder
          code={`STEP 0${WIZARD_STEPS.indexOf(stepParam) + 1}${decision.readOnly ? " / DONE" : " / OPEN"}`}
          title={`Step ${WIZARD_STEPS.indexOf(stepParam) + 1}: ${STEP_LABEL[stepParam]}${decision.readOnly ? " (done, view only)" : ""}`}
          blurb={BLURB[stepParam]}
        />
      </>
    );
  };

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <NetworkGuard />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <Breadcrumb items={[{ label: "Vaults", to: "/vaults" }, { label: "Create vault" }]} />
        <h1 className="text-3xl">Create vault</h1>
        <Stepper done={done} current={first} />
        {body()}
      </main>
      <Footer />
    </div>
  );
}
