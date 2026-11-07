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
  notFound: "wrong door.",
  about: "read the fine print.",
  proof: "show me the receipts.",
  drill: "drill. just a drill.",
  inspect: "reading the fine print.",
  // tab, network, clipboard, scroll...
  back: "oh, you're back.",
  backLong: "i kept watch.",
  offline: "connection lost.",
  online: "back online.",
  copyAddr: "double-check that addr.",
  pasteAddr: "checking that for you.",
  reading: "reading along.",
  fastScroll: "slow down.",
  bottom: "that's all, folks.",
  top: "back to the top.",
  resize: "who moved the walls?",
  exit: "leaving already?",
  context: "inspecting? me too.",
  spin: "wheee.",
  hello: "yes?",
  night: "night shift.",
  // data-aura elements
  dangerHover: "think twice.",
  dangerClick: "bold move.",
  blockedRow: "blocked for a reason.",
  shy: "not looking.",
  invalid: "that won't work.",
  success: "clean.",
  external: "careful out there.",
  // wallet / chain
  wallet: {
    linked: "wallet linked.",
    bye: "bye, wallet.",
    signed: "signed. nice.",
    wrongChain: "wrong chain.",
    pending: "any minute now...",
  },
  gate: {
    connect: "show me your wallet.",
    sign: "read before you sign.",
    verify: "checking the list...",
    ok: "welcome in.",
    refused: "no sig, no entry.",
    spin: "easy on the bolts.",
    hold: "steady... steady...",
  },
} as const;

/** 5, 10, then every 10th blocked attack gets a celebration. */
export const isMilestone = (n: number): boolean => n === 5 || (n >= 10 && n % 10 === 0);

export const milestoneLine = (n: number): string =>
  n === 5 ? "five blocked today." : n === 10 ? "ten blocked. easy." : `${n} blocked. still going.`;

/** 22:00 to 04:59 local time. */
export const isNightHour = (hour: number): boolean => hour >= 22 || hour < 5;

export const pick = (list: readonly string[]): string =>
  list[Math.floor(Math.random() * list.length)];
