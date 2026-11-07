import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { resolveTheme, readMode } from "@/shared/theme/theme";
import { maybeDarkIntro } from "./darkIntro";
import { installGlobalReactions } from "./globalReactions";
import { LINES } from "./lines";
import { idleForMs, react, touch, useMascot } from "./mascotStore";

const SLEEP_AFTER_MS = 20_000;
/** Pages where reading is the whole job, so Aura-kun nods off sooner. */
const SLEEP_AFTER_BY_ROUTE: Record<string, number> = { "/proof": 10_000 };

/** Page-level behavior: falls asleep when idle, wakes on input, gets nervous near the Kill-Switch. */
export function MascotController() {
  const { pathname } = useLocation();
  const sleepAfter = useRef(SLEEP_AFTER_MS);
  sleepAfter.current = SLEEP_AFTER_BY_ROUTE[pathname] ?? SLEEP_AFTER_MS;

  useEffect(() => {
    maybeDarkIntro(resolveTheme(readMode()));

    const onInput = () => touch();
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));

    const sleepCheck = setInterval(() => {
      if (idleForMs() > sleepAfter.current && useMascot.getState().mood === "idle") {
        react("sleep", { text: LINES.sleep, hold: 0, passive: true });
      }
    }, 1000);

    const stopGlobal = installGlobalReactions();

    return () => {
      events.forEach((e) => window.removeEventListener(e, onInput));
      clearInterval(sleepCheck);
      stopGlobal();
    };
  }, []);

  // The Kill-Switch section only exists on some pages, so look for it again after every route change.
  useEffect(() => {
    let io: IntersectionObserver | undefined;
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => {
        const kill = document.getElementById("kill-switch");
        if (!kill) return;
        io = new IntersectionObserver(
          ([e]) => {
            const mood = useMascot.getState().mood;
            if (e.isIntersecting) react("kill", { text: LINES.kill, hold: 0 });
            else if (mood === "kill") react("idle", { hold: 0 });
          },
          { threshold: 0.5 },
        );
        io.observe(kill);
      });
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
      io?.disconnect();
      if (useMascot.getState().mood === "kill") react("idle", { hold: 0 });
    };
  }, [pathname]);
  return null;
}
