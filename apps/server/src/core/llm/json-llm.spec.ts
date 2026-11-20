import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.schema';
import { createJsonLlm, generateWithTimeout, LlmTimeoutError, toGeminiSchema, toOpenAiSchema, type JsonLlm, type JsonObject } from './json-llm';
import { LlmQuota } from './quota';

const schema: JsonObject = {
  type: 'object',
  properties: {
    thought: { type: 'string' },
    action: { type: 'object', properties: { type: { type: 'string', enum: ['swap', 'none'] }, pct: { type: 'number' } } },
    list: { type: 'array', items: { type: 'string' } },
  },
};

const env = (over: Partial<Env> = {}) =>
  ({ GEMINI_MODEL: 'gemini-2.5-flash', GEMINI_RPM: 10, LLM_RPM: 60, ...over }) as unknown as Env;

describe('schema conversion', () => {
  it('OpenAI strict: every key required, no extra keys', () => {
    expect(toOpenAiSchema(schema)).toEqual({
      type: 'object',
      properties: {
        thought: { type: 'string' },
        action: {
          type: 'object',
          properties: { type: { type: 'string', enum: ['swap', 'none'] }, pct: { type: 'number' } },
          required: ['type', 'pct'],
          additionalProperties: false,
        },
        list: { type: 'array', items: { type: 'string' } },
      },
      required: ['thought', 'action', 'list'],
      additionalProperties: false,
    });
  });

  it('Gemini: upper-case types, enums, required and property order', () => {
    expect(toGeminiSchema(schema)).toEqual({
      type: 'OBJECT',
      properties: {
        thought: { type: 'STRING' },
        action: {
          type: 'OBJECT',
          properties: { type: { type: 'STRING', enum: ['swap', 'none'], format: 'enum' }, pct: { type: 'NUMBER' } },
          required: ['type', 'pct'],
          propertyOrdering: ['type', 'pct'],
        },
        list: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['thought', 'action', 'list'],
      propertyOrdering: ['thought', 'action', 'list'],
    });
  });
});

describe('createJsonLlm', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is off with no key and no base URL', async () => {
    const llm = createJsonLlm(env());
    expect(llm.available).toBe(false);
    await expect(llm.generate({} as never)).rejects.toThrow(/no LLM configured/);
  });

  it('uses Gemini with a key', () => {
    expect(createJsonLlm(env({ GEMINI_API_KEY: 'k' }))).toMatchObject({ available: true, label: 'gemini-2.5-flash', rpm: 10 });
  });

  it('prefers LLM_BASE_URL and posts a strict json_schema with the bearer key', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"thought":"x"}' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const llm = createJsonLlm(env({ GEMINI_API_KEY: 'k', LLM_BASE_URL: 'http://llm.local/v1/', LLM_MODEL: 'gemma', LLM_KEY: 'secret' }));
    expect(llm).toMatchObject({ available: true, label: 'gemma', rpm: 60 });

    const out = await llm.generate({ name: 'agent_action', system: 'sys', user: 'usr', schema, temperature: 0.4, maxTokens: 400, signal: new AbortController().signal });
    expect(out).toBe('{"thought":"x"}');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://llm.local/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: 'gemma', temperature: 0.4, max_tokens: 400, messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'usr' }] });
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'agent_action', strict: true, schema: toOpenAiSchema(schema) } });
  });

  it('throws on a non-2xx answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));
    const llm = createJsonLlm(env({ LLM_BASE_URL: 'http://llm.local/v1', LLM_MODEL: 'gemma' }));
    await expect(llm.generate({ name: 'n', system: 's', user: 'u', schema, temperature: 0, maxTokens: 1, signal: new AbortController().signal })).rejects.toThrow('HTTP 503');
  });
});

describe('generateWithTimeout', () => {
  const req = { name: 'n', system: 's', user: 'u', schema, temperature: 0, maxTokens: 10 };

  it('returns the model text', async () => {
    const llm: JsonLlm = { available: true, label: 't', rpm: 1, generate: async () => 'ok' };
    await expect(generateWithTimeout(llm, req, 100)).resolves.toBe('ok');
  });

  it('rejects and aborts a model that never answers', async () => {
    let signal: AbortSignal | undefined;
    const llm: JsonLlm = {
      available: true,
      label: 't',
      rpm: 1,
      generate: (r) => {
        signal = r.signal;
        return new Promise(() => {});
      },
    };
    await expect(generateWithTimeout(llm, req, 10)).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(signal?.aborted).toBe(true);
  });
});

describe('LlmQuota', () => {
  it('allows max calls per window, then frees them as the window slides', () => {
    const q = new LlmQuota(3, 1_000);
    expect([q.tryTake(0, 0), q.tryTake(0, 1), q.tryTake(0, 2), q.tryTake(0, 3)]).toEqual([true, true, true, false]);
    expect(q.tryTake(0, 1_000)).toBe(true);
  });

  it('a reserve leaves room for other callers', () => {
    const q = new LlmQuota(10, 1_000);
    let explained = 0;
    while (q.tryTake(2, 0)) explained++;
    expect(explained).toBe(8);
    expect(q.tryTake(0, 0)).toBe(true);
    expect(q.tryTake(0, 0)).toBe(true);
    expect(q.tryTake(0, 0)).toBe(false);
  });
});
