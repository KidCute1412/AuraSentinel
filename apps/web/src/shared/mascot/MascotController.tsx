import { useEffect } from "react";
import { LINES } from "./lines";
import { idleForMs, react, touch, useMascot } from "./mascotStore";

const SLEEP_AFTER_MS = 20_000;

/** Page-level behavior: falls asleep when idle, wakes on input, gets nervous near the Kill-Switch. */
export function MascotController() {
  useEffect(() => {
    const onInput = () => touch();
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));

    const sleepCheck = setInterval(() => {
      if (idleForMs() > SLEEP_AFTER_MS && useMascot.getState().mood === "idle") {
        react("sleep", { text: LINES.sleep, hold: 0, passive: true });
      }
    }, 1000);

    const kill = document.getElementById("kill-switch");
    let io: IntersectionObserver | undefined;
    if (kill) {
      io = new IntersectionObserver(
        ([e]) => {
          const mood = useMascot.getState().mood;
          if (e.isIntersecting) react("kill", { text: LINES.kill, hold: 0 });
          else if (mood === "kill") react("idle", { hold: 0 });
        },
        { threshold: 0.5 },
      );
      io.observe(kill);
    }

    return () => {
      events.forEach((e) => window.removeEventListener(e, onInput));
      clearInterval(sleepCheck);
      io?.disconnect();
    };
  }, []);
  return null;
}
