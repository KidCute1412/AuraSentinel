import { Injectable, Logger } from '@nestjs/common';
import type { Explanation } from '../../core/types';
import { GeminiExplainer } from './adapters/gemini.explainer';
import { TemplateExplainer } from './adapters/template.explainer';
import type { ExplainInput } from './explainer.port';

/** Gemini first; on timeout, bad JSON or any error fall back to the template. Never throws. */
@Injectable()
export class ExplainerService {
  private readonly log = new Logger(ExplainerService.name);

  constructor(
    private readonly gemini: GeminiExplainer,
    private readonly template: TemplateExplainer,
  ) {}

  async explain(input: ExplainInput): Promise<Explanation> {
    try {
      return await this.gemini.explain(input);
    } catch (err) {
      this.log.warn(`LLM explainer failed, using template: ${(err as Error).message}`);
      return this.template.explain(input);
    }
  }
}
