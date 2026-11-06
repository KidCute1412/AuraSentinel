export type ThemeMode = "auto" | "light" | "dark";

const KEY = "agentshield-theme";

export function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    /* storage can be blocked (private mode): fall back to auto */
  }
  return "auto";
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "auto") return mode;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyMode(mode: ThemeMode): void {
  document.documentElement.dataset.theme = resolveTheme(mode);
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}
