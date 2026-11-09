import type { Address } from "@agentshield/shared";
import { sameAddress } from "@/shared/lib/address";

export const WIZARD_STEPS = ["safe", "module", "policy", "fund"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_LABEL: Record<WizardStep, string> = {
  safe: "Safe",
  module: "Module",
  policy: "Policy",
  fund: "Fund",
};

export const isWizardStep = (v: string | undefined): v is WizardStep => !!v && (WIZARD_STEPS as readonly string[]).includes(v);
export const wizardPath = (step: WizardStep): string => `/vaults/new/${step}`;

/** What the chain says about the Safe being set up. Progress is derived from this, never stored (invariant 1). */
export interface WizardFacts {
  owners: readonly Address[];
  moduleEnabled: boolean;
  policyActive: boolean;
  funded: boolean;
}

/** Completion per step. `null` facts = no Safe chosen yet. */
export function completedSteps(wallet: Address | null, facts: WizardFacts | null): Record<WizardStep, boolean> {
  const isOwner = !!wallet && !!facts && facts.owners.some((o) => sameAddress(o, wallet));
  return {
    safe: isOwner,
    // A later step only counts when every earlier one holds, so a stale fact can never skip ahead.
    module: isOwner && !!facts?.moduleEnabled,
    policy: isOwner && !!facts?.moduleEnabled && !!facts?.policyActive,
    fund: isOwner && !!facts?.moduleEnabled && !!facts?.policyActive && !!facts?.funded,
  };
}

/** First step that is not done, or `null` when the whole wizard is complete. */
export function firstIncompleteStep(done: Record<WizardStep, boolean>): WizardStep | null {
  return WIZARD_STEPS.find((s) => !done[s]) ?? null;
}

export type WizardDecision =
  | { kind: "allow"; readOnly: boolean }
  | { kind: "redirect"; to: string; notice: string };

/**
 * Guard for /vaults/new/:step. Client-side UX only: the contract and the wallet signature are the real gate.
 * - requested step is the first incomplete one: allow
 * - requested step is already done: allow read-only
 * - requested step is ahead of the first incomplete one: send the user back there
 * - wizard fully done: everything is read-only
 */
export function decideWizardStep(requested: WizardStep, done: Record<WizardStep, boolean>): WizardDecision {
  const first = firstIncompleteStep(done);
  if (first === null) return { kind: "allow", readOnly: true };
  const ri = WIZARD_STEPS.indexOf(requested);
  const fi = WIZARD_STEPS.indexOf(first);
  if (ri < fi) return { kind: "allow", readOnly: true };
  if (ri === fi) return { kind: "allow", readOnly: false };
  return {
    kind: "redirect",
    to: wizardPath(first),
    notice: `Finish the "${STEP_LABEL[first]}" step before "${STEP_LABEL[requested]}".`,
  };
}
