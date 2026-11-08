/**
 * Wallet sign-in flow (SIWE). UI-only for now: every transition is driven by the page, so wiring real
 * wagmi/SIWE later means replacing the callers of `reduce`, not this state machine.
 */
export type Step = "connect" | "sign" | "verify" | "done";
export type WalletId = "core" | "metamask";

export type Phase =
  | { kind: "idle" }
  | { kind: "connecting"; wallet: WalletId }
  | { kind: "connected"; wallet: WalletId }
  | { kind: "verifying"; wallet: WalletId }
  | { kind: "done"; wallet: WalletId }
  | { kind: "denied"; wallet: WalletId };

export type Action =
  | { type: "pick"; wallet: WalletId }
  | { type: "connected" }
  | { type: "sign" }
  | { type: "reject" }
  | { type: "verified" }
  | { type: "reset" };

export const initialPhase: Phase = { kind: "idle" };

export function reduce(state: Phase, action: Action): Phase {
  switch (action.type) {
    case "pick":
      return state.kind === "idle" || state.kind === "denied"
        ? { kind: "connecting", wallet: action.wallet }
        : state;
    case "connected":
      return state.kind === "connecting" ? { kind: "connected", wallet: state.wallet } : state;
    case "sign":
      return state.kind === "connected" ? { kind: "verifying", wallet: state.wallet } : state;
    case "reject":
      return state.kind === "connected" ? { kind: "denied", wallet: state.wallet } : state;
    case "verified":
      return state.kind === "verifying" ? { kind: "done", wallet: state.wallet } : state;
    case "reset":
      return initialPhase;
  }
}

/** Gate progress 0..3 = how many of connect/sign/verify are finished. */
export function stageOf(p: Phase): 0 | 1 | 2 | 3 {
  switch (p.kind) {
    case "idle":
    case "connecting":
    case "denied":
      return p.kind === "denied" ? 1 : 0;
    case "connected":
      return 1;
    case "verifying":
      return 2;
    case "done":
      return 3;
  }
}

export function activeStep(p: Phase): Step {
  switch (p.kind) {
    case "idle":
    case "connecting":
      return "connect";
    case "connected":
    case "denied":
      return "sign";
    case "verifying":
      return "verify";
    case "done":
      return "done";
  }
}

/** Deterministic 5x5 mirrored pixel grid for a wallet address (cosmetic identity card). */
export function identicon(address: string): boolean[][] {
  let h = 2166136261;
  for (const ch of address.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const rows: boolean[][] = [];
  for (let y = 0; y < 5; y++) {
    const half = [0, 1, 2].map((x) => ((h >>> (y * 3 + x)) & 1) === 1);
    rows.push([half[0], half[1], half[2], half[1], half[0]]);
  }
  return rows;
}

export const shortAddress = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Placeholder wallet until wagmi is wired. */
export const MOCK_ADDRESS = "0x7A3f5C9e21B84dD0a6F13c8E92b7064a1c91Cd02";

/** A second placeholder wallet for the "new wallet" path, so it owns no fixture vaults. */
export const MOCK_NEW_ADDRESS = "0x9B2c4E7a10D35f68AaB1c0E2d94F7b3856c0Fe21";

export const mockAddressFor = (wallet: WalletId): string => (wallet === "metamask" ? MOCK_NEW_ADDRESS : MOCK_ADDRESS);

/**
 * Where to send the user after signing in. Only same-site absolute paths are accepted (no "//host", no
 * schemes, no loops back into /signin), so a crafted `from` can never become an open redirect.
 */
export function safeReturnPath(from: unknown): string | null {
  if (typeof from !== "string") return null;
  if (!from.startsWith("/") || from.startsWith("//") || from.includes("\\")) return null;
  if (/^\/(signin|signup)(\/|\?|#|$)/.test(from)) return null;
  return from;
}
