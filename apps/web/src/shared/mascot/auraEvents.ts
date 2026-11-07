import { LINES, isMilestone, milestoneLine } from "./lines";
import { react, useMascot, type Mood } from "./mascotStore";

const stamps = new Map<string, number>();

/** True (and starts the cooldown) if `key` has not fired within `ms`. */
export function cooled(key: string, ms: number): boolean {
  const now = Date.now();
  if (now - (stamps.get(key) ?? -Infinity) < ms) return false;
  stamps.set(key, now);
  return true;
}

/**
 * Background flavor: only plays while Aura-kun is idle or in a short transient mood (the live feed flips
 * him between happy/alarm all the time, so requiring idle would starve these). A held mood (a page
 * mood, cheer, hug, sleep...) is never interrupted. At most once per `ms`; a skipped attempt does not
 * burn the cooldown.
 */
const OPEN: Mood[] = ["idle", "happy", "alarm", "hop"];

export function ambient(key: string, ms: number, mood: Mood, opts: { text?: string; hold?: number }): boolean {
  const s = useMascot.getState();
  if (s.hidden || !OPEN.includes(s.mood)) return false;
  if (!cooled(key, ms)) return false;
  // not "passive": the line must not be eaten by the live feed's speech gap. OPEN moods are never sticky anyway.
  react(mood, opts);
  return true;
}

/** Things app code announces. The mascot never reads chain or wallet state itself, only these UI events. */
export type AuraEvent = "wallet:linked" | "wallet:disconnected" | "wallet:signed" | "chain:wrong";

export function announce(event: AuraEvent): void {
  switch (event) {
    case "wallet:linked":
      return react("happy", { text: LINES.wallet.linked, hold: 1300 });
    case "wallet:disconnected":
      return react("annoyed", { text: LINES.wallet.bye, hold: 1500 });
    case "wallet:signed":
      return react("cheer", { text: LINES.wallet.signed, hold: 1000 });
    case "chain:wrong":
      return react("alarm", { text: LINES.wallet.wrongChain, hold: 1800 });
  }
}

/**
 * Call when a wallet/tx step starts; call the returned function when it ends.
 * If it takes longer than `ms`, Aura-kun gets nervous until it ends.
 */
export function watchPending(ms = 4000): () => void {
  const t = setTimeout(() => react("worry", { text: LINES.wallet.pending, hold: 0, passive: true }), ms);
  return () => {
    clearTimeout(t);
    if (useMascot.getState().mood === "worry") react("idle", { hold: 0 });
  };
}

let blockedAttacks = 0;

/** A user-fired attack was blocked. Celebrates at 5, 10, 20, 30... */
export function registerBlockedAttack(): number {
  blockedAttacks += 1;
  if (isMilestone(blockedAttacks)) react("cheer", { text: milestoneLine(blockedAttacks), hold: 1800 });
  return blockedAttacks;
}

/** Test helper. */
export function resetAuraEvents(): void {
  stamps.clear();
  blockedAttacks = 0;
}
