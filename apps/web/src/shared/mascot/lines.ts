/** Aura-kun speaks English only, short lines (<= 24 chars), lowercase, dry humor. */
export const LINES = {
  approve: ["ok, you may pass.", "looks clean.", "approved. carry on."],
  blocked: ["nice try.", "nope. not today.", "denied. next?"],
  poke: ["hey!", "boop.", "that tickles.", "i'm working here."],
  annoyed: "ok that's enough.",
  hug: "...thanks. i needed that.",
  rob: "skill issue.",
  pickup: ["whoa!", "put me down!", "hey, hands!"],
  land: ["nailed it.", "thanks.", "i meant to do that."],
  hard: "ow.",
  sleep: "zzz... any rug pulls?",
  wake: "i'm up. i'm up.",
  theme: "whoa, lights.",
  kill: "please don't press that.",
  shadesOn: "now i'm unstoppable.",
  shadesOff: "ok, back to work.",
} as const;

export const pick = (list: readonly string[]): string =>
  list[Math.floor(Math.random() * list.length)];
