/**
 * In-process controls so spamming the demo buttons never exhausts the Gemini free tier.
 * Both are best effort: when they say no, the caller simply uses the template.
 */

/** Sliding window: at most `max` calls in any `windowMs`. */
export class RateLimiter {
  private readonly calls: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs = 60_000,
  ) {}

  tryTake(now = Date.now()): boolean {
    while (this.calls.length > 0 && now - (this.calls[0] as number) >= this.windowMs) this.calls.shift();
    if (this.calls.length >= this.max) return false;
    this.calls.push(now);
    return true;
  }
}

/** Small LRU with a time-to-live. Map keeps insertion order, so the first key is the oldest. */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly maxEntries = 200,
    private readonly ttlMs = 10 * 60_000,
  ) {}

  get(key: string, now = Date.now()): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    this.entries.delete(key);
    if (hit.expires <= now) return undefined;
    this.entries.set(key, hit); // refresh recency
    return hit.value;
  }

  set(key: string, value: V, now = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
