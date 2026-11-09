import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import type { Explanation } from '../../core/types';
import { GeminiExplainer } from './adapters/gemini.explainer';
import { TemplateExplainer } from './adapters/template.explainer';
import type { ExplainInput } from './explainer.port';
import { buildFacts } from './facts';
import { promptFacts, sanitizeUntrusted } from './prompts/explain.prompt';
import { RateLimiter, TtlCache } from './rate-control';

/**
 * Gemini first; on timeout, bad JSON, a guard rejection or any error swap to the template
 * adapter. Never throws, so a slow or broken LLM can never delay or block a swap (P3).
 * Successful LLM answers are cached by their facts, and Gemini calls are capped per minute.
 */
@Injectable()
export class ExplainerService {
  private readonly log = new Logger(ExplainerService.name);
  private readonly cache = new TtlCache<Explanation>();
  private readonly limiter: RateLimiter;

  constructor(
    private readonly gemini: GeminiExplainer,
    private readonly template: TemplateExplainer,
    @Inject(ENV) env: Env,
  ) {
    this.limiter = new RateLimiter(env.GEMINI_RPM);
  }

  async explain(input: ExplainInput): Promise<Explanation> {
    if (!this.gemini.available) return this.template.explain(input);

    const key = cacheKey(input);
    const cached = this.cache.get(key);
    if (cached) return cached;

    if (!this.limiter.tryTake()) {
      this.log.debug('Gemini rate limit reached, using template');
      return this.template.explain(input);
    }
    try {
      const explanation = await this.gemini.explain(input);
      this.cache.set(key, explanation);
      return explanation;
    } catch (err) {
      this.log.warn(`LLM explainer failed, using template: ${(err as Error).message}`);
      return this.template.explain(input);
    }
  }
}

/** Same facts and same visitor text give the same explanation (system-design §3.7). */
function cacheKey(input: ExplainInput): string {
  return JSON.stringify([promptFacts(buildFacts(input)), sanitizeUntrusted(input.untrustedText ?? '')]);
}
