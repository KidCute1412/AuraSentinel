import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { LINES } from "@/shared/mascot/lines";
import { react } from "@/shared/mascot/mascotStore";
import { applyMode, readMode, type ThemeMode } from "./theme";

const NEXT: Record<ThemeMode, ThemeMode> = { auto: "light", light: "dark", dark: "auto" };
const ICON = { auto: Monitor, light: Sun, dark: Moon } as const;

/** Cycles AUTO → LIGHT → DARK. AUTO follows the OS and reacts to OS changes live. */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(readMode);

  useEffect(() => {
    if (mode !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyMode("auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const Icon = ICON[mode];
  return (
    <button
      type="button"
      onClick={() => {
        const next = NEXT[mode];
        applyMode(next);
        setMode(next);
        react("whoa", { text: LINES.theme, hold: 900 });
      }}
      aria-label={`Theme: ${mode}. Click to change.`}
      className="inline-flex h-10 items-center gap-2 border border-line-strong px-3 font-mono text-[11px] font-bold uppercase tracking-widest text-fg transition-colors duration-150 hover:bg-hover"
    >
      <Icon aria-hidden className="size-4" />
      <span className="hidden sm:inline">{mode}</span>
    </button>
  );
}
