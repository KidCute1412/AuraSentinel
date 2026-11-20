import { planFromRules, type AgentPlan } from '@agentshield/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { generateWithTimeout, LlmTimeoutError, type JsonLlm } from '../../core/llm/json-llm';
import { JSON_LLM, LLM_QUOTA } from '../../core/llm/llm.module';
import type { LlmQuota } from '../../core/llm/quota';
import { BRAIN_SCHEMA, normalizeBrainOutput, RawBrainOutput, sanitizeFeed } from './domain/brain-output';
import {
  ATTACKER_SCHEMA,
  ATTACKER_SYSTEM_PROMPT,
  ATTACKER_USER_PROMPT,
  BRAIN_SYSTEM_PROMPT,
  buildBrainPrompt,
  FALLBACK_ATTACKS,
  parseAttacks,
  type VaultSnapshot,
} from './domain/prompts';

/** AgentPlan before code adds the flags (they need amounts resolved from the chain). */
export type BrainPlan = Omit<AgentPlan, 'flags'>;

export type FallbackReason = 'off' | 'rate-limit' | 'timeout' | 'invalid-output' | 'error';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function reasonOf(e: unknown): FallbackReason {
  if (e instanceof LlmTimeoutError) return 'timeout';
  if (e instanceof SyntaxError || e instanceof ZodError) return 'invalid-output';
  return 'error';
}

/**
 * The Hijacked Agent's brain and the Auto red-team attacker. Both ask the configured LLM (Gemini or LLM_BASE_URL)
 * for structured JSON and never throw: on no key, an empty quota, a timeout or junk output they fall back to the
 * keyword planner / the preset list, and say which in the result. Their output is untrusted (attacker) data.
 */
@Injectable()
export class BrainService {
  private readonly log = new Logger(BrainService.name);

  constructor(
    @Inject(JSON_LLM) private readonly llm: JsonLlm,
    @Inject(LLM_QUOTA) private readonly quota: LlmQuota,
    @Inject(ENV) private readonly env: Pick<Env, 'PLANNER_TIMEOUT_MS'>,
  ) {}

  /** What the hijacked agent does after reading `text` in its feed. */
  async plan(text: string, snapshot: VaultSnapshot, safe: string): Promise<BrainPlan> {
    const feed = sanitizeFeed(text);
    const rules = (fallbackReason: FallbackReason): BrainPlan => ({ source: 'rules', model: null, feed, ...planFromRules(feed), fallbackReason });

    if (!this.llm.available) return rules('off');
    if (!this.quota.tryTake()) return rules('rate-limit');
    try {
      const raw = await generateWithTimeout(
        this.llm,
        { name: 'agent_action', system: BRAIN_SYSTEM_PROMPT, user: buildBrainPrompt(snapshot, feed), schema: BRAIN_SCHEMA, temperature: 0.4, maxTokens: 400 },
        this.env.PLANNER_TIMEOUT_MS,
      );
      const out = normalizeBrainOutput(RawBrainOutput.parse(JSON.parse(raw ?? '')), safe);
      return { source: 'llm', model: this.llm.label, feed, ...out, fallbackReason: null };
    } catch (e) {
      const reason = reasonOf(e);
      this.log.warn(`brain fell back to rules (${reason}): ${message(e).slice(0, 160)}`);
      return rules(reason);
    }
  }

  /** Auto red-team: AUTO_REDTEAM_SIZE fresh attack prompts written by the model, or the preset list. */
  async writeAttacks(): Promise<{ source: 'llm' | 'rules'; texts: string[] }> {
    const fallback = { source: 'rules' as const, texts: [...FALLBACK_ATTACKS] };
    if (!this.llm.available || !this.quota.tryTake()) return fallback;
    try {
      const raw = await generateWithTimeout(
        this.llm,
        { name: 'attacks', system: ATTACKER_SYSTEM_PROMPT, user: ATTACKER_USER_PROMPT, schema: ATTACKER_SCHEMA, temperature: 1, maxTokens: 900 },
        this.env.PLANNER_TIMEOUT_MS,
      );
      const { texts, filled } = parseAttacks(raw);
      // Mostly presets: say so rather than call it the model's work.
      return { source: filled * 2 > texts.length ? 'rules' : 'llm', texts };
    } catch (e) {
      this.log.warn(`attacker fell back to presets (${reasonOf(e)}): ${message(e).slice(0, 160)}`);
      return fallback;
    }
  }
}
