import { GoogleGenAI } from '@google/genai';
import type { Env } from '../config/env.schema';

/**
 * One structured-output call to whichever LLM is configured (the OpenAI-compatible LLM_BASE_URL wins over Gemini,
 * like the explainer). Used by the red-team brain and the attacker that writes Auto red-team prompts. Callers treat
 * the answer as untrusted text: they parse it with Zod and fall back to rules on any problem.
 */

/** The JSON Schema subset both providers accept. Every property is required (OpenAI strict mode). */
export type JsonField =
  | { type: 'string'; enum?: readonly string[]; description?: string }
  | { type: 'number'; description?: string }
  | { type: 'array'; items: JsonField; description?: string }
  | JsonObject;
export interface JsonObject {
  type: 'object';
  properties: Record<string, JsonField>;
  description?: string;
}

export interface JsonRequest {
  /** Schema name (OpenAI `json_schema.name`). */
  name: string;
  system: string;
  user: string;
  schema: JsonObject;
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
}

export interface JsonLlm {
  /** False when nothing is configured: callers go straight to their fallback. */
  readonly available: boolean;
  /** Model id, for logs and for AgentPlan.model. */
  readonly label: string;
  /** Provider calls per minute (GEMINI_RPM or LLM_RPM). */
  readonly rpm: number;
  /** Raw model text (expected to be JSON). Throws on HTTP/SDK errors; must honour `signal`. */
  generate(req: JsonRequest): Promise<string | undefined>;
}

/** Standard JSON Schema with every key required and no extras (OpenAI `strict: true`). */
export function toOpenAiSchema(f: JsonField): Record<string, unknown> {
  switch (f.type) {
    case 'object':
      return {
        type: 'object',
        properties: Object.fromEntries(Object.entries(f.properties).map(([k, v]) => [k, toOpenAiSchema(v)])),
        required: Object.keys(f.properties),
        additionalProperties: false,
      };
    case 'array':
      return { type: 'array', items: toOpenAiSchema(f.items) };
    case 'string':
      return f.enum ? { type: 'string', enum: [...f.enum] } : { type: 'string' };
    case 'number':
      return { type: 'number' };
  }
}

/** Gemini's OpenAPI-style schema: upper-case types, `required` listed, property order kept. */
export function toGeminiSchema(f: JsonField): Record<string, unknown> {
  switch (f.type) {
    case 'object':
      return {
        type: 'OBJECT',
        properties: Object.fromEntries(Object.entries(f.properties).map(([k, v]) => [k, toGeminiSchema(v)])),
        required: Object.keys(f.properties),
        propertyOrdering: Object.keys(f.properties),
      };
    case 'array':
      return { type: 'ARRAY', items: toGeminiSchema(f.items) };
    case 'string':
      return f.enum ? { type: 'STRING', enum: [...f.enum], format: 'enum' } : { type: 'STRING' };
    case 'number':
      return { type: 'NUMBER' };
  }
}

const OFF: JsonLlm = {
  available: false,
  label: 'off',
  rpm: 1,
  generate: () => Promise.reject(new Error('no LLM configured (GEMINI_API_KEY or LLM_BASE_URL)')),
};

function openAiCompatible(env: Env, baseUrl: string, model: string): JsonLlm {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (env.LLM_KEY) headers.authorization = `Bearer ${env.LLM_KEY}`;
  return {
    available: true,
    label: model,
    rpm: env.LLM_RPM,
    async generate(req) {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        signal: req.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          response_format: { type: 'json_schema', json_schema: { name: req.name, strict: true, schema: toOpenAiSchema(req.schema) } },
          temperature: req.temperature,
          max_tokens: req.maxTokens,
        }),
      });
      if (!res.ok) throw new Error(`LLM endpoint returned HTTP ${res.status}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      return body.choices?.[0]?.message?.content ?? undefined;
    },
  };
}

function gemini(env: Env, apiKey: string): JsonLlm {
  const ai = new GoogleGenAI({ apiKey });
  return {
    available: true,
    label: env.GEMINI_MODEL,
    rpm: env.GEMINI_RPM,
    async generate(req) {
      const res = await ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: req.user,
        config: {
          systemInstruction: req.system,
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(req.schema),
          // Thinking would blow the time budget; the task is short and fully specified.
          thinkingConfig: { thinkingBudget: 0 },
          temperature: req.temperature,
          maxOutputTokens: req.maxTokens,
          abortSignal: req.signal,
        },
      });
      return res.text;
    },
  };
}

/** Same choice as the explainer module: LLM_BASE_URL + LLM_MODEL, else GEMINI_API_KEY, else off. */
export function createJsonLlm(env: Env): JsonLlm {
  if (env.LLM_BASE_URL && env.LLM_MODEL) return openAiCompatible(env, env.LLM_BASE_URL, env.LLM_MODEL);
  if (env.GEMINI_API_KEY) return gemini(env, env.GEMINI_API_KEY);
  return OFF;
}

export class LlmTimeoutError extends Error {
  constructor(ms: number) {
    super(`LLM timed out after ${ms} ms`);
  }
}

/** Runs one generate call, aborted and rejected after `ms` even if the SDK ignores the signal. */
export async function generateWithTimeout(llm: JsonLlm, req: Omit<JsonRequest, 'signal'>, ms: number): Promise<string | undefined> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LlmTimeoutError(ms));
    }, ms);
  });
  try {
    return await Promise.race([llm.generate({ ...req, signal: controller.signal }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
