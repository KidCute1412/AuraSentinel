import { Module } from '@nestjs/common';
import { GeminiExplainer } from './adapters/gemini.explainer';
import { OpenAiCompatibleExplainer } from './adapters/openai-compatible.explainer';
import { TemplateExplainer } from './adapters/template.explainer';
import { LLM_EXPLAINER, type LlmExplainer } from './explainer.port';
import { ExplainerService } from './explainer.service';

@Module({
  providers: [
    GeminiExplainer,
    OpenAiCompatibleExplainer,
    TemplateExplainer,
    {
      // A configured LLM_BASE_URL wins over Gemini. With neither, the service uses the template.
      provide: LLM_EXPLAINER,
      inject: [OpenAiCompatibleExplainer, GeminiExplainer],
      useFactory: (openai: OpenAiCompatibleExplainer, gemini: GeminiExplainer): LlmExplainer =>
        openai.available ? openai : gemini,
    },
    ExplainerService,
  ],
  exports: [ExplainerService],
})
export class ExplainerModule {}
