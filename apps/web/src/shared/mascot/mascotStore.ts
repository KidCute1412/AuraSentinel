import { create } from "zustand";
import { LINES } from "./lines";

export type Mood =
  | "idle"
  | "happy"
  | "alarm"
  | "sleep"
  | "annoyed"
  | "hug"
  | "hop"
  | "whoa"
  | "guard"
  | "kill"
  | "stunned";

interface Line {
  id: number;
  text: string;
}

interface MascotState {
  mood: Mood;
  shades: boolean;
  line: Line | null;
  /** Person chose to hide Aura-kun (remembered in localStorage). */
  hidden: boolean;
}

const HIDE_KEY = "agentshield-aura-hidden";
const readHidden = (): boolean => {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
};

export const useMascot = create<MascotState>(() => ({
  mood: "idle",
  shades: false,
  line: null,
  hidden: readHidden(),
}));

const set = useMascot.setState;
const get = useMascot.getState;

/** Moods the page feed must not interrupt (user is interacting, or the user is asleep/near Kill). */
const STICKY: Mood[] = ["sleep", "hug", "annoyed", "guard", "kill", "whoa", "stunned"];
const SAY_GAP_MS = 2500;
const LINE_MS = 2800;

let moodTimer: ReturnType<typeof setTimeout> | undefined;
let lineTimer: ReturnType<typeof setTimeout> | undefined;
let lineId = 0;
let lastSay = 0;
let lastTouch = Date.now();

export function say(text: string, force = false): void {
  const now = Date.now();
  if (!force && now - lastSay < SAY_GAP_MS) return;
  lastSay = now;
  set({ line: { id: ++lineId, text } });
  clearTimeout(lineTimer);
  lineTimer = setTimeout(() => set({ line: null }), LINE_MS);
}

interface ReactOpts {
  text?: string;
  /** ms before returning to idle; 0 = stay until changed. */
  hold?: number;
  /** Fired by the page feed, not the user: dropped while a sticky mood is active. */
  passive?: boolean;
}

export function react(mood: Mood, { text, hold = 1200, passive = false }: ReactOpts = {}): void {
  if (passive && STICKY.includes(get().mood)) return;
  set({ mood });
  clearTimeout(moodTimer);
  if (text) say(text, !passive);
  if (hold > 0) {
    moodTimer = setTimeout(() => {
      if (get().mood === mood) set({ mood: "idle" });
    }, hold);
  }
}

/** Any real user input. Wakes Aura-kun if asleep. */
export function touch(): void {
  lastTouch = Date.now();
  if (get().mood === "sleep") {
    set({ mood: "idle" });
    say(LINES.wake, true);
  }
}

export const idleForMs = (): number => Date.now() - lastTouch;

export function toggleShades(): void {
  const next = !get().shades;
  set({ shades: next });
  say(next ? LINES.shadesOn : LINES.shadesOff, true);
}

export function setHidden(hidden: boolean): void {
  set({ hidden });
  try {
    localStorage.setItem(HIDE_KEY, hidden ? "1" : "0");
  } catch {
    /* storage can be blocked */
  }
}

/** Test helper: reset all module state. */
export function resetMascot(): void {
  clearTimeout(moodTimer);
  clearTimeout(lineTimer);
  lastSay = 0;
  lastTouch = Date.now();
  set({ mood: "idle", shades: false, line: null, hidden: false });
}
