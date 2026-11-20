/**
 * One per-minute budget for every LLM call this process makes (explainer, red-team brain, attacker), so together they
 * stay under the provider's limit (Gemini free tier: ~10 RPM). Sliding window, in memory, best effort: when it says
 * no, the caller uses its template or rules instead of waiting.
 */
export class LlmQuota {
  private readonly calls: number[] = [];

  constructor(
    readonly max: number,
    private readonly windowMs = 60_000,
  ) {}

  /** Takes one call if, after it, at least `reserve` calls are still left in the window. */
  tryTake(reserve = 0, now = Date.now()): boolean {
    while (this.calls.length > 0 && now - (this.calls[0] as number) >= this.windowMs) this.calls.shift();
    if (this.calls.length + 1 + reserve > this.max) return false;
    this.calls.push(now);
    return true;
  }
}
