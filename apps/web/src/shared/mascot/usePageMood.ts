import { useEffect } from "react";
import { react, useMascot, type Mood } from "./mascotStore";

const RETRY_MS = 600;

/**
 * While the element with `id` is mostly on screen, Aura-kun shows `mood` (and says `text` once on entry).
 * Passive: a sticky mood (hug, annoyed, a page greeting...) blocks it, so we retry until it frees up.
 * Returns to idle on leave.
 */
export function usePageMood(id: string, mood: Mood, text?: string): void {
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el || typeof IntersectionObserver === "undefined") return;

    let retry: ReturnType<typeof setInterval> | undefined;
    let said = false;
    const stop = () => {
      clearInterval(retry);
      retry = undefined;
    };
    const apply = () => {
      if (useMascot.getState().mood === mood) return;
      react(mood, { hold: 0, text: said ? undefined : text, passive: true });
      if (useMascot.getState().mood === mood) said = true;
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          apply();
          retry ??= setInterval(apply, RETRY_MS);
        } else {
          stop();
          said = false;
          if (useMascot.getState().mood === mood) react("idle", { hold: 0 });
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      stop();
      if (useMascot.getState().mood === mood) react("idle", { hold: 0 });
    };
  }, [id, mood, text]);
}
