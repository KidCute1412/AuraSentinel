import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../../core/config/config.module';
import type { Env } from '../../../core/config/env.schema';
import type { Explanation } from '../../../core/types';
import type { ExplainInput, LlmExplainer } from '../explainer.port';
import { explainWithLlm, type GenerateFn } from '../llm';

/** Structured output: the model must return exactly {"messageVi": string}. Zod checks it again. */
const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'explanation',
    strict: true,
    schema: {
      type: 'object',
      properties: { messageVi: { type: 'string' } },
      required: ['messageVi'],
      additionalProperties: false,
    },
  },
};

/**
 * Any OpenAI-compatible chat endpoint (self-hosted vLLM, Ollama...): POST {LLM_BASE_URL}/chat/completions. Throws
 * on timeout, a non-2xx status, bad JSON or schema mismatch; ExplainerService then swaps to the template adapter.
 */
@Injectable()
export class OpenAiCompatibleExplainer implements LlmExplainer {
  readonly label: string;
  readonly rpm: number;
  private readonly generate?: GenerateFn;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.label = env.LLM_MODEL ?? 'openai-compatible';
    this.rpm = env.LLM_RPM;
    if (!env.LLM_BASE_URL || !env.LLM_MODEL) return;
    const model = env.LLM_MODEL;
    const url = `${env.LLM_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (env.LLM_KEY) headers.authorization = `Bearer ${env.LLM_KEY}`;
    this.generate = async ({ system, user, signal }) => {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: RESPONSE_FORMAT,
          temperature: 0.3,
          max_tokens: 400,
        }),
      });
      if (!res.ok) throw new Error(`LLM endpoint returned HTTP ${res.status}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      return body.choices?.[0]?.message?.content ?? undefined;
    };
  }

  get available(): boolean {
    return this.generate !== undefined;
  }

  async explain(input: ExplainInput): Promise<Explanation> {
    if (!this.generate) throw new Error('LLM_BASE_URL / LLM_MODEL not set');
    return explainWithLlm(input, this.generate, this.env.EXPLAINER_TIMEOUT_MS);
  }
}
