import { Inject, Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { ENV } from '../../../core/config/config.module';
import type { Env } from '../../../core/config/env.schema';
import type { Explanation } from '../../../core/types';
import type { ExplainerPort, ExplainInput } from '../explainer.port';

const outputSchema = z.object({ messageVi: z.string().min(1).max(500) });

/** TODO(AIE): numeric-consistency guard + <untrusted_input> prompt (skill llm-explainer-guard). */
@Injectable()
export class GeminiExplainer implements ExplainerPort {
  private readonly ai?: GoogleGenAI;

  constructor(@Inject(ENV) private readonly env: Env) {
    if (env.GEMINI_API_KEY) this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async explain(input: ExplainInput): Promise<Explanation> {
    if (!this.ai) throw new Error('GEMINI_API_KEY not set');
    const res = await this.ai.models.generateContent({
      model: this.env.GEMINI_MODEL,
      contents: `Giải thích ngắn gọn bằng tiếng Việt: ${input.verdict} ${input.reasonCode ?? ''}`,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: AbortSignal.timeout(this.env.EXPLAINER_TIMEOUT_MS),
      },
    });
    const parsed = outputSchema.parse(JSON.parse(res.text ?? '{}'));
    return { messageVi: parsed.messageVi, source: 'llm' };
  }
}
