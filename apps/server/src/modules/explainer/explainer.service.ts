import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Explanation } from '../../core/types';
import { TemplateExplainer } from './adapters/template.explainer';
import { LLM_EXPLAINER, type ExplainInput, type LlmExplainer } from './explainer.port';
import { buildFacts } from './facts';
import { promptFacts, sanitizeUntrusted } from './prompts/explain.prompt';
import { RateLimiter, TtlCache } from './rate-control';

/**
 * The LLM adapter first (LLM_BASE_URL when configured, else Gemini); on timeout, bad JSON, a guard rejection
 * or any error swap to the template adapter. Never throws, so a slow or broken LLM can never delay or
 * block a swap (P3). Successful LLM answers are cached by their facts, and LLM calls are capped per minute.
 */
@Injectable()
export class ExplainerService {
  private readonly log = new Logger(ExplainerService.name);
  private readonly cache = new TtlCache<Explanation>();
  private readonly limiter: RateLimiter;

  constructor(
    @Inject(LLM_EXPLAINER) private readonly llm: LlmExplainer,
    private readonly template: TemplateExplainer,
  ) {
    this.limiter = new RateLimiter(llm.rpm);
    this.log.log(llm.available ? `LLM explainer: ${llm.label} (max ${llm.rpm}/min)` : 'LLM explainer: off, template only');
  }

  async explain(input: ExplainInput): Promise<Explanation> {
    if (!this.llm.available) return this.template.explain(input);

    const key = cacheKey(input);
    const cached = this.cache.get(key);
    if (cached) return cached;

    if (!this.limiter.tryTake()) {
      this.log.debug('LLM rate limit reached, using template');
      return this.template.explain(input);
    }
    try {
      const explanation = await this.llm.explain(input);
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
