export const KILL = ["k", "i", "l", "l"];

/** Letters compare case-insensitively; named keys (ArrowUp...) stay as they are. */
export const normalizeKey = (key: string): string => (key.length === 1 ? key.toLowerCase() : key);

/** Typing into a field must never trigger easter eggs. */
export function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

/**
 * Feeds keys to several target sequences at once. `push` returns the index of the sequence that
 * just completed, or -1. A wrong key restarts the sequence (and counts as its first key if it matches).
 */
export function createMatcher(sequences: readonly (readonly string[])[]) {
  const progress = sequences.map(() => 0);
  return {
    push(rawKey: string): number {
      const key = normalizeKey(rawKey);
      let done = -1;
      sequences.forEach((seq, i) => {
        if (key === seq[progress[i]]) progress[i] += 1;
        else progress[i] = key === seq[0] ? 1 : 0;
        if (progress[i] === seq.length) {
          progress[i] = 0;
          done = i;
        }
      });
      return done;
    },
    reset() {
      progress.fill(0);
    },
  };
}
