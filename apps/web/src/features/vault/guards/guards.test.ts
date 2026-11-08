import { describe, expect, it } from "vitest";
import type { Address } from "@agentshield/shared";
import { decideSection, sectionPath, vaultRole, visibleSections } from "./access";
import { completedSteps, decideWizardStep, firstIncompleteStep, type WizardFacts } from "./wizard";

const OWNER = "0x7A3f5C9e21B84dD0a6F13c8E92b7064a1c91Cd02" as Address;
const OTHER = "0x1111111111111111111111111111111111111111" as Address;

const facts = (over: Partial<WizardFacts> = {}): WizardFacts => ({
  owners: [OWNER],
  moduleEnabled: false,
  policyActive: false,
  funded: false,
  ...over,
});

describe("wizard completion (derived from chain facts)", () => {
  it("nothing is done without a wallet or a Safe", () => {
    expect(firstIncompleteStep(completedSteps(null, null))).toBe("safe");
    expect(firstIncompleteStep(completedSteps(OWNER, null))).toBe("safe");
  });

  it("a wallet that is not a Safe owner never gets past step 1", () => {
    const done = completedSteps(OTHER, facts({ moduleEnabled: true, policyActive: true, funded: true }));
    expect(firstIncompleteStep(done)).toBe("safe");
  });

  it("owner matching ignores address case", () => {
    expect(completedSteps(OWNER.toLowerCase() as Address, facts()).safe).toBe(true);
  });

  it("a later fact cannot skip an earlier incomplete step", () => {
    // funded balance exists but the module is not enabled yet
    const done = completedSteps(OWNER, facts({ funded: true, policyActive: true }));
    expect(done).toEqual({ safe: true, module: false, policy: false, fund: false });
    expect(firstIncompleteStep(done)).toBe("module");
  });

  it("is complete only when every step holds", () => {
    const done = completedSteps(OWNER, facts({ moduleEnabled: true, policyActive: true, funded: true }));
    expect(firstIncompleteStep(done)).toBeNull();
  });
});

describe("decideWizardStep", () => {
  const afterStep1 = completedSteps(OWNER, facts());

  it("typing the URL of step 2 before step 1 is done redirects back to step 1", () => {
    const d = decideWizardStep("module", completedSteps(OTHER, facts()));
    expect(d).toMatchObject({ kind: "redirect", to: "/vaults/new/safe" });
    expect((d as { notice: string }).notice).toMatch(/Safe/);
  });

  it("skipping several steps ahead lands on the first incomplete one", () => {
    expect(decideWizardStep("fund", afterStep1)).toMatchObject({ kind: "redirect", to: "/vaults/new/module" });
    expect(decideWizardStep("policy", afterStep1)).toMatchObject({ kind: "redirect", to: "/vaults/new/module" });
  });

  it("the current step is editable and finished steps are read-only", () => {
    expect(decideWizardStep("module", afterStep1)).toEqual({ kind: "allow", readOnly: false });
    expect(decideWizardStep("safe", afterStep1)).toEqual({ kind: "allow", readOnly: true });
  });

  it("switching to a wallet that is not the owner re-locks the wizard", () => {
    const mid = facts({ moduleEnabled: true });
    expect(decideWizardStep("policy", completedSteps(OWNER, mid))).toEqual({ kind: "allow", readOnly: false });
    expect(decideWizardStep("policy", completedSteps(OTHER, mid))).toMatchObject({ kind: "redirect", to: "/vaults/new/safe" });
  });

  it("a finished wizard is entirely read-only", () => {
    const all = completedSteps(OWNER, facts({ moduleEnabled: true, policyActive: true, funded: true }));
    expect(decideWizardStep("safe", all)).toEqual({ kind: "allow", readOnly: true });
  });
});

describe("vault access", () => {
  it("derives the role from Safe owners", () => {
    expect(vaultRole(null, [OWNER])).toBe("anonymous");
    expect(vaultRole(OTHER, [OWNER])).toBe("viewer");
    expect(vaultRole(OWNER, [OWNER])).toBe("owner");
  });

  it("hides owner-only sections from non-owners", () => {
    expect(visibleSections("owner")).toContain("settings");
    expect(visibleSections("viewer")).not.toContain("settings");
    expect(visibleSections("anonymous")).not.toContain("settings");
  });

  it("redirects a non-owner who types /settings, but lets owners and public pages through", () => {
    expect(decideSection("settings", "viewer").kind).toBe("redirect");
    expect(decideSection("settings", "anonymous").kind).toBe("redirect");
    expect(decideSection("settings", "owner")).toEqual({ kind: "allow" });
    expect(decideSection("activity", "anonymous")).toEqual({ kind: "allow" });
  });

  it("builds section paths", () => {
    expect(sectionPath("0xabc", "overview")).toBe("/vaults/0xabc");
    expect(sectionPath("0xabc", "red-team")).toBe("/vaults/0xabc/red-team");
  });
});
