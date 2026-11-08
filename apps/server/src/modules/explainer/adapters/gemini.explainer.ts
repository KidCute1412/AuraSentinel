import { Inject, Injectable } from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import { ENV } from '../../../core/config/config.module';
import type { Env } from '../../../core/config/env.schema';
import type { Explanation } from '../../../core/types';
import type { ExplainerPort, ExplainInput } from '../explainer.port';
import { explainWithLlm, type GenerateFn } from '../llm';

/** Structured output: the model must return exactly {"messageVi": string}. Zod checks it again. */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: { messageVi: { type: Type.STRING } },
  required: ['messageVi'],
};

/**
 * Gemini 2.5 Flash with thinking off (thinking blows the 2 s budget). Throws on timeout, bad
 * JSON or schema mismatch; ExplainerService then swaps to the template adapter.
 */
@Injectable()
export class GeminiExplainer implements ExplainerPort {
  private readonly generate?: GenerateFn;

  constructor(@Inject(ENV) private readonly env: Env) {
    if (!env.GEMINI_API_KEY) return;
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    this.generate = async ({ system, user, signal }) => {
      const res = await ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          thinkingConfig: { thinkingBudget: 0 },
          temperature: 0.3,
          maxOutputTokens: 256,
          abortSignal: signal,
        },
      });
      return res.text;
    };
  }

  get available(): boolean {
    return this.generate !== undefined;
  }

  async explain(input: ExplainInput): Promise<Explanation> {
    if (!this.generate) throw new Error('GEMINI_API_KEY not set');
    return explainWithLlm(input, this.generate, this.env.EXPLAINER_TIMEOUT_MS);
  }
}
