import { toggleShades, useMascot } from "./mascotStore";

const KEY = "agentshield-aura-dark-intro";

/** Pure rule: Aura-kun puts on shades the first time the person is in dark mode, and never again. */
export const shouldShowDarkIntro = (theme: "light" | "dark", seen: boolean): boolean => theme === "dark" && !seen;

const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** Call whenever the resolved theme is known (on load, after a toggle). Safe to call repeatedly. */
export function maybeDarkIntro(theme: "light" | "dark"): void {
  if (!shouldShowDarkIntro(theme, read())) return;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* storage can be blocked: the intro may repeat per visit, which is harmless */
  }
  setTimeout(() => {
    if (!useMascot.getState().shades) toggleShades();
  }, 1200);
}
