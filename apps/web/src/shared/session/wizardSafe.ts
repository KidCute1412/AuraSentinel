import { create } from "zustand";
import type { Address } from "@agentshield/shared";
import { parseAddressParam } from "@/shared/lib/address";

const KEY = "agentshield.wizard.safe";

function read(): Address | null {
  try {
    return parseAddressParam(localStorage.getItem(KEY) ?? undefined);
  } catch {
    return null; // storage blocked (private window, etc.): the wizard just starts from step 1
  }
}

interface WizardSafeState {
  safe: Address | null;
  setSafe: (safe: Address | null) => void;
  /** Save for the next visit only (a Safe still being mined): this tab keeps showing the current step. */
  remember: (safe: Address) => void;
}

function store(safe: Address | null) {
  try {
    if (safe) localStorage.setItem(KEY, safe);
    else localStorage.removeItem(KEY);
  } catch {
    // ignore: in-memory value still works for this tab
  }
}

/**
 * Which Safe the user is setting up, so closing the tab and coming back resumes. This is a pointer only:
 * which STEP they are on is always recomputed from the chain (invariant 1), never stored.
 */
export const useWizardSafe = create<WizardSafeState>((set) => ({
  safe: read(),
  setSafe: (safe) => {
    store(safe);
    set({ safe });
  },
  remember: (safe) => store(safe),
}));
