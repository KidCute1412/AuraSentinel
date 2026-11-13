import type { Address } from "@agentshield/shared";
import { sameAddress } from "@/shared/lib/address";

/** anonymous = no wallet; viewer = wallet but not a Safe owner; owner = wallet is in Safe.getOwners(). */
export type VaultRole = "anonymous" | "viewer" | "owner";

export function vaultRole(wallet: Address | null, owners: readonly Address[]): VaultRole {
  if (!wallet) return "anonymous";
  return owners.some((o) => sameAddress(o, wallet)) ? "owner" : "viewer";
}

/**
 * Who may press Run / attack on a /vaults/:safe page. The owner always; on the live API also anyone on the public demo
 * vault, because the server already accepts guests there (api.md #10, #12: public when isDemo, throttled). The
 * simulation keeps its owner-only rule. /demo itself lets everyone act (VaultDashboard mode "demo").
 */
export function canRunJobs(role: VaultRole, isDemo: boolean, source: "mock" | "live"): boolean {
  return role === "owner" || (source === "live" && isDemo);
}

export type VaultSection = "overview" | "activity" | "policy" | "funds" | "red-team" | "settings";

export const SECTION_LABEL: Record<VaultSection, string> = {
  overview: "Overview",
  activity: "Activity",
  policy: "Policy",
  funds: "Funds",
  "red-team": "Red team",
  settings: "Settings",
};

export const OWNER_ONLY_SECTIONS: readonly VaultSection[] = ["settings"];

/** Sections shown in the nav for a role. Owner-only entries are hidden, not greyed out. */
export const visibleSections = (role: VaultRole): VaultSection[] =>
  (Object.keys(SECTION_LABEL) as VaultSection[]).filter((s) => role === "owner" || !OWNER_ONLY_SECTIONS.includes(s));

export type SectionDecision = { kind: "allow" } | { kind: "redirect"; notice: string };

/** Direct URL to an owner-only page without being the owner: back to Overview with a notice. */
export function decideSection(section: VaultSection, role: VaultRole): SectionDecision {
  if (OWNER_ONLY_SECTIONS.includes(section) && role !== "owner") {
    return { kind: "redirect", notice: "Only the vault owner can open this page." };
  }
  return { kind: "allow" };
}

export const sectionPath = (safe: string, section: VaultSection): string =>
  section === "overview" ? `/vaults/${safe}` : `/vaults/${safe}/${section}`;
