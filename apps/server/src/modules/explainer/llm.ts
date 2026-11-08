import { z } from 'zod';
import type { Explanation } from '../../core/types';
import type { ExplainInput } from './explainer.port';
import { buildFacts } from './facts';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts/explain.prompt';

/** The only thing the model may produce (system-design §3.7). Unknown keys are dropped. */
export const LlmExplanation = z.object({ messageVi: z.string().trim().min(10).max(280) });

/** Calls the model once and returns its raw text. Must honour `signal`. */
export type GenerateFn = (req: { system: string; user: string; signal: AbortSignal }) => Promise<string | undefined>;

export class ExplainTimeoutError extends Error {
  constructor(ms: number) {
    super(`LLM explainer timed out after ${ms} ms`);
  }
}

/** Rejects after `ms` even if the SDK ignores the abort signal. */
function withTimeout<T>(p: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ExplainTimeoutError(ms));
    }, ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * LLM path: prompt -> model (bounded by `timeoutMs`) -> JSON -> Zod. Throws on any problem so
 * the caller falls back to the template. verdict and budgetUsedPct come from the deterministic
 * facts, never from the model (P3).
 */
export async function explainWithLlm(
  input: ExplainInput,
  generate: GenerateFn,
  timeoutMs: number,
): Promise<Explanation> {
  const facts = buildFacts(input);
  const controller = new AbortController();
  const text = await withTimeout(
    generate({ system: SYSTEM_PROMPT, user: buildUserPrompt(facts, input.untrustedText), signal: controller.signal }),
    timeoutMs,
    controller,
  );
  const { messageVi } = LlmExplanation.parse(JSON.parse(text ?? ''));
  return { verdict: facts.verdict, budgetUsedPct: facts.budgetUsedPct, messageVi, source: 'llm' };
}
