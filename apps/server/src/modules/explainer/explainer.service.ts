import { Injectable, Logger } from '@nestjs/common';
import type { Explanation } from '../../core/types';
import { GeminiExplainer } from './adapters/gemini.explainer';
import { TemplateExplainer } from './adapters/template.explainer';
import type { ExplainInput } from './explainer.port';

/**
 * Gemini first; on timeout, bad JSON or any error swap to the template adapter. Never throws,
 * so a slow or broken LLM can never delay or block a swap (P3).
 */
@Injectable()
export class ExplainerService {
  private readonly log = new Logger(ExplainerService.name);

  constructor(
    private readonly gemini: GeminiExplainer,
    private readonly template: TemplateExplainer,
  ) {}

  async explain(input: ExplainInput): Promise<Explanation> {
    if (this.gemini.available) {
      try {
        return await this.gemini.explain(input);
      } catch (err) {
        this.log.warn(`LLM explainer failed, using template: ${(err as Error).message}`);
      }
    }
    return this.template.explain(input);
  }
}
