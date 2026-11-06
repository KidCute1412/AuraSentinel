import { useEffect, useState } from "react";
import { useReducedMotion } from "@/shared/lib/useReducedMotion";

const KEY = "agentshield-boot-seen";
const STEP_MS = 280;
const FIRST_MS = 220;
const FADE_MS = 200;

const LINES = [
  ["shield 1 · auditor", "OK"],
  ["shield 2 · policy", "OK"],
  ["vault", "LOCKED"],
  ["owner key", "NOT ON SERVER"],
] as const;

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return true; // storage blocked: never nag
  }
}

function markSeen(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

/** First visit per session, landing page only: a 1.4s "systems check" before the hero. Click or any key skips. */
export function BootSequence() {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(() => window.location.pathname === "/" && !alreadySeen());
  const [shown, setShown] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    markSeen();
    if (reduced) {
      setOpen(false);
      return;
    }
    const timers: number[] = [];
    LINES.forEach((_, i) => timers.push(window.setTimeout(() => setShown(i + 1), FIRST_MS + i * STEP_MS)));
    const readyAt = FIRST_MS + LINES.length * STEP_MS + 120;
    timers.push(window.setTimeout(() => setShown(LINES.length + 1), readyAt));
    timers.push(window.setTimeout(() => setLeaving(true), readyAt + 260));
    timers.push(window.setTimeout(() => setOpen(false), readyAt + 260 + FADE_MS));
    return () => timers.forEach(clearTimeout);
  }, [open, reduced]);

  useEffect(() => {
    if (!open) return;
    const skip = () => setLeaving(true);
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, [open]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setOpen(false), FADE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  if (!open) return null;
  return (
    <div
      role="status"
      aria-label="Running system check"
      onClick={() => setLeaving(true)}
      className="blueprint fixed inset-0 z-[80] flex cursor-pointer items-center justify-center bg-bg px-6 transition-opacity duration-200"
      style={{ opacity: leaving ? 0 : 1 }}
    >
      <div className="w-full max-w-md font-mono text-base">
        <div className="mono-label mb-4">AGENTSHIELD // BOOT</div>
        <ul className="grid gap-2">
          {LINES.slice(0, Math.min(shown, LINES.length)).map(([name, state]) => (
            <li key={name} className="animate-boot-line flex items-baseline justify-between gap-4 border-b border-line pb-2">
              <span className="text-soft">&gt; {name}</span>
              <span className="font-bold uppercase tracking-widest text-accent-text">{state}</span>
            </li>
          ))}
        </ul>
        {shown > LINES.length && <p className="animate-boot-line mt-4 font-bold uppercase tracking-widest">&gt; protected_</p>}
        <p className="mono-label mt-8">click or press any key to skip</p>
      </div>
    </div>
  );
}
