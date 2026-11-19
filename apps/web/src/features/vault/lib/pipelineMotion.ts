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

/**
 * Where the packet is shown: at `stop`, and whether that gate's verdict is out yet. Each gate is first checked (the
 * packet waits, the gate scans) and then answers: walk on, or a barrier. The vault answers on arrival.
 */
export interface TrackPos {
  stop: number;
  revealed: boolean;
}

export const settledAt = (target: TrackTarget): TrackPos => ({ stop: target.stop, revealed: true });
export const isSettled = (pos: TrackPos, target: TrackTarget): boolean => pos.stop === target.stop && pos.revealed;

/** One beat of the walk toward `target`. */
export function nextPos(pos: TrackPos, target: TrackTarget): TrackPos {
  if (pos.stop > target.stop) return settledAt(target);
  if (pos.stop < target.stop) {
    const stop = nextStop(pos.stop, target.stop, target.bypass);
    return { stop, revealed: stop === VAULT_STOP };
  }
  return { stop: pos.stop, revealed: true };
}

/** What a gate looks like with the packet at `pos`: passed behind it, being checked at it, waiting ahead of it. */
export function shownLook(real: GateLook, index: number, pos: TrackPos, target: TrackTarget): GateLook {
  if (real === "bypassed") return "bypassed";
  if (index < pos.stop || isSettled(pos, target)) return real;
  return index === pos.stop ? "active" : "pending";
}

/** The gate whose table should be open while the packet walks: the one it is at (the last gate once in the vault). */
export const gateAt = (stop: number): number => Math.min(stop, VAULT_STOP - 1);
