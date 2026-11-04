import { Module } from '@nestjs/common';
import { GeminiExplainer } from './adapters/gemini.explainer';
import { TemplateExplainer } from './adapters/template.explainer';
import { ExplainerService } from './explainer.service';

@Module({
  providers: [GeminiExplainer, TemplateExplainer, ExplainerService],
  exports: [ExplainerService],
})
export class ExplainerModule {}
