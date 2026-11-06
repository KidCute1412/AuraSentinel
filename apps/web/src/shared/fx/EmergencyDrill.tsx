import { useEffect, useRef, useState } from "react";
import { Chamfer } from "@/shared/ui/Chamfer";
import { Stamp } from "@/shared/ui/Stamp";
import { useCountUp } from "@/shared/lib/useCountUp";
import { LINES } from "@/shared/mascot/lines";
import { react } from "@/shared/mascot/mascotStore";
import { createMatcher, isEditable, KILL } from "./sequence";

const KILL_MS = 1480;
const DRILL_MS = 1900;

function Banner() {
  const ms = useCountUp(KILL_MS, 1400);
  const done = ms >= KILL_MS;
  return (
    <div role="status" className="pointer-events-none fixed inset-0 z-[70]">
      <div aria-hidden className="animate-drill absolute inset-0" />
      <div aria-hidden className="hazard hazard-move absolute inset-x-0 top-0 h-4" />
      <div aria-hidden className="hazard hazard-move absolute inset-x-0 bottom-0 h-4" />
      <div className="absolute inset-x-0 top-24 flex justify-center px-4">
        <Chamfer edge="bg-danger" fill="bg-tint-pink" code="KILL / DRILL" innerClassName="px-8 pb-9 pt-5 text-center">
          <span className="mono-label !text-danger-text">Kill-Switch drill</span>
          <div className="tabular mt-1 text-5xl font-black">{(ms / 1000).toFixed(2)}s</div>
          <div className="mt-3 flex min-h-7 items-center justify-center">
            {done && <Stamp tone="danger" animate>Session key revoked</Stamp>}
          </div>
          <p className="mono-label mt-2">Drill only. No transaction was sent.</p>
        </Chamfer>
      </div>
    </div>
  );
}

/** Easter egg: type "kill" anywhere to run a harmless Kill-Switch drill. */
export function EmergencyDrill() {
  const [active, setActive] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    const matcher = createMatcher([KILL]);
    let timer: ReturnType<typeof setTimeout> | undefined;

    // IMEs (e.g. Vietnamese Unikey/EVKey) can report key "Process"/"Unidentified" for letters: fall back to the physical key.
    const keyOf = (e: KeyboardEvent): string =>
      e.key.length === 1 || e.key.startsWith("Arrow") || !e.code.startsWith("Key") ? e.key : e.code.slice(3).toLowerCase();

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;
      if (matcher.push(keyOf(e)) < 0 || busy.current) return;
      busy.current = true;
      setActive(true);
      react("alarm", { hold: 1400 });
      timer = setTimeout(() => {
        setActive(false);
        busy.current = false;
        react("happy", { text: LINES.drill, hold: 1600 });
      }, DRILL_MS);
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
      busy.current = false;
    };
  }, []);

  return active ? <Banner /> : null;
}
