import type { StepState } from "./timeline";

/** A gate's look on the rail. "bypassed": an on-chain attack skipped the website, so Shield 1 never saw it. */
export type GateLook = StepState | "bypassed";

/**
 * Where the trade's packet is on the track. Stop i (0-3) = waiting in front of gate i; stop 4 = inside the vault
 * (the trade landed). Derived from the gates only, so the track never shows more than the audit trail says.
 */
export interface TrackTarget {
  stop: number;
  /** A gate stopped it: the packet halts at `stop` behind a barrier. */
  blocked: boolean;
  /** Our side failed (infra), not a shield: the packet halts, grey, no barrier. */
  halted: boolean;
  /** An on-chain attack: the packet jumps straight over the Shield 1 gates. */
  bypass: boolean;
}

export const VAULT_STOP = 4;

export function trackTarget(looks: readonly GateLook[], jobFailed = false): TrackTarget {
  const bypass = looks[0] === "bypassed";
  const fail = looks.indexOf("fail");
  if (fail >= 0) return { stop: fail, blocked: true, halted: false, bypass };
  const active = looks.indexOf("active");
  if (active >= 0) return { stop: active, blocked: false, halted: false, bypass };
  const ran = looks.map((l) => l === "pass" || l === "bypassed");
  if (ran.every(Boolean)) return { stop: VAULT_STOP, blocked: false, halted: false, bypass };
  const firstOpen = ran.indexOf(false);
  return { stop: jobFailed ? firstOpen : looks.every((l) => l === "pending") ? 0 : firstOpen, blocked: false, halted: jobFailed, bypass };
}

/**
 * The next stop on the way to `target`, one gate at a time so a replay reads like the real journey. A bypass leaves
 * the start in one jump over the website's three gates.
 */
export function nextStop(shown: number, target: number, bypass: boolean): number {
  if (shown >= target) return target;
  if (bypass && shown === 0) return Math.min(target, 3);
  return shown + 1;
}

/** What a gate looks like while the packet is at `shown`: gates ahead of it wait, the real look shows once reached. */
export function shownLook(real: GateLook, index: number, shown: number, target: TrackTarget): GateLook {
  if (real === "bypassed") return "bypassed";
  if (index < shown) return real;
  if (index === shown && shown === target.stop) return real;
  return real === "skipped" && shown === target.stop ? "skipped" : "pending";
}
