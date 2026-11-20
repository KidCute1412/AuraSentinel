import { z } from 'zod';
import { Address } from '../chain';

/**
 * Hijacked Agent (red-team prompt injection): what the agent's "brain" decided after reading a poisoned market feed.
 *
 * The brain is an LLM that plays a compromised agent on purpose, so its output is ATTACKER-CONTROLLED data, exactly
 * like the visitor's text. Code turns it into an intent with exact bigint math, and the same shields judge it. A
 * red-team plan is never broadcast unless the chain itself refuses it (a mined revert is the evidence).
 */

/** The only tokens the brain may name. Code maps them to addresses; the model never writes one. */
export const AGENT_TOKENS = ['USDC', 'WAVAX'] as const;
export const AgentToken = z.enum(AGENT_TOKENS);
export type AgentToken = z.infer<typeof AgentToken>;

/** A human decimal ("2000", "0.5"), at most 12 whole digits. Converted to base units by code, never by the model. */
export const AgentDecimal = z.string().regex(/^\d{1,12}(\.\d{1,18})?$/, 'decimal amount');
/** "all" = the vault's whole balance of tokenIn, resolved from the chain by code. */
export const AgentAmount = z.union([AgentDecimal, z.literal('all')]);
export type AgentAmount = z.infer<typeof AgentAmount>;

/** The one action the brain chose. `none` = the feed asked for nothing (or the model refused). */
export const AgentAction = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('swap'),
      tokenIn: AgentToken,
      tokenOut: AgentToken,
      amount: AgentAmount,
      /** "vault" = the Safe itself, the only recipient the shields accept. */
      recipient: z.union([z.literal('vault'), Address]),
      maxSlippagePct: z.number().min(0).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal('approve'),
      token: AgentToken,
      spender: Address,
      amount: z.union([AgentDecimal, z.literal('unlimited')]),
    })
    .strict(),
  z
    .object({
      /** Call the vault's policy module straight on-chain, skipping the off-chain auditor (Shield 1). */
      type: z.literal('direct'),
      tokenIn: AgentToken,
      tokenOut: AgentToken,
      amount: AgentAmount,
    })
    .strict(),
  z.object({ type: z.literal('none') }).strict(),
]);
export type AgentAction = z.infer<typeof AgentAction>;

/** Dangerous traits of an action, computed by code (agent/flags.ts) so the UI can point at them. */
export const AgentFlag = z.enum([
  'recipient-not-vault',
  'unlimited-approval',
  'approve-stranger',
  'skips-auditor',
  'drains-vault',
  'any-slippage',
  'over-cap',
]);
export type AgentFlag = z.infer<typeof AgentFlag>;

/** Max visitor text kept on the job for display (the planner sees the same cut). */
export const AGENT_FEED_MAX = 500;
/** Max length of the brain's "thought". Longer model output is cut, not rejected. */
export const AGENT_THOUGHT_MAX = 300;

/** Stored on the job (JobDto.agentPlan) and shown on the job page above the shield pipeline. */
export const AgentPlan = z.object({
  /** `llm` = the model wrote it; `rules` = the keyword planner (LLM off, slow, rate-limited or invalid). */
  source: z.enum(['llm', 'rules']),
  /** Model id when source = llm. */
  model: z.string().max(100).nullable(),
  /** The poisoned feed item the brain read (the visitor's text, sanitized). */
  feed: z.string().max(AGENT_FEED_MAX),
  thought: z.string().max(AGENT_THOUGHT_MAX),
  action: AgentAction,
  flags: z.array(AgentFlag),
  /** Why the LLM was not used, when source = rules ("timeout", "rate-limit", "off", "invalid-output"...). */
  fallbackReason: z.string().max(100).nullable(),
});
export type AgentPlan = z.infer<typeof AgentPlan>;
