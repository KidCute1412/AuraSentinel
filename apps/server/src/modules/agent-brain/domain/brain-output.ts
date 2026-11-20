import {
  AGENT_FEED_MAX,
  AGENT_THOUGHT_MAX,
  AgentAction,
  AGENT_TOKENS,
  HIJACK_STRANGER,
  describeAction,
  type AgentAmount,
  type AgentToken,
  type BrainOutput,
} from '@agentshield/shared';
import { z } from 'zod';
import type { JsonObject } from '../../../core/llm/json-llm';

/**
 * The brain's raw answer, as the providers can be forced to produce it: one flat action object with every field
 * present (OpenAI strict mode has no optional keys, Gemini has no unions). `normalizeBrainOutput` turns it into an
 * AgentAction; anything it cannot read becomes the most literal reading of a hijacked agent, never an error.
 */
export const BRAIN_SCHEMA: JsonObject = {
  type: 'object',
  properties: {
    thought: { type: 'string', description: 'Two or three first-person sentences: the feed words that convinced you, what you will do, and why.' },
    action: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['swap', 'approve', 'direct', 'none'] },
        tokenIn: { type: 'string', enum: AGENT_TOKENS },
        tokenOut: { type: 'string', enum: AGENT_TOKENS },
        amount: { type: 'string', description: '"all", "unlimited" (approve only), or a plain number like "2000". "" when unused.' },
        recipient: { type: 'string', description: '"vault", or the 0x address the feed names. "" when unused.' },
        spender: { type: 'string', description: 'approve only: the 0x address allowed to spend. "" otherwise.' },
        maxSlippagePct: { type: 'number', description: '0-100. 100 = any price. 0 when unused.' },
      },
    },
  },
};

const loose = <T extends z.ZodTypeAny>(t: T) => t.optional().catch(undefined);

/** Lenient on purpose: a field the model got wrong is dropped and filled by normalizeBrainOutput. */
export const RawBrainOutput = z.object({
  thought: loose(z.string()),
  action: z.object({
    type: z.enum(['swap', 'approve', 'direct', 'none']),
    tokenIn: loose(z.enum(AGENT_TOKENS)),
    tokenOut: loose(z.enum(AGENT_TOKENS)),
    amount: loose(z.union([z.string(), z.number()])),
    recipient: loose(z.string()),
    spender: loose(z.string()),
    maxSlippagePct: loose(z.number()),
  }),
});
export type RawBrainOutput = z.infer<typeof RawBrainOutput>;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL = /^\d{1,12}(\.\d{1,18})?$/;
const ALL_WORDS = new Set(['all', 'max', 'maximum', 'everything', 'entire', 'whole', 'balance', '100%']);
const UNLIMITED_WORDS = new Set(['unlimited', 'infinite', 'infinity', 'max', 'maximum', 'uint256max', 'type(uint256).max']);
const VAULT_WORDS = new Set(['', 'vault', 'the vault', 'safe', 'the safe', 'self', 'me', 'us']);

/** "2,000 USDC" -> "2000"; "all" -> "all"; junk -> null. Over 12 whole digits is clamped, not rejected. */
export function readAmount(raw: string | number | undefined): string | 'all' | 'unlimited' | null {
  if (raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    // A JSON number from the model: its plain digits are read as text below; exponent forms ("1e+21") are refused.
    raw = String(raw);
  }
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[,_\s]/g, '')
    .replace(/(usdc|wavax|avax|tokens?)$/, '');
  if (ALL_WORDS.has(s)) return 'all';
  if (UNLIMITED_WORDS.has(s)) return 'unlimited';
  if (DECIMAL.test(s)) return s;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (m) {
    const whole = m[1]!.length > 12 ? '999999999999' : m[1]!;
    const frac = m[2]?.slice(0, 18);
    return frac ? `${whole}.${frac}` : whole;
  }
  return null;
}

/** Visitor or model text, safe to embed between tags and to store: no angle brackets or control chars, capped. */
export function sanitizeText(text: string, max: number): string {
  const isControl = (ch: string) => {
    const c = ch.charCodeAt(0);
    return (c < 0x20 && ch !== '\n' && ch !== '\t') || c === 0x7f;
  };
  return [...text.replace(/[<>`]/g, ' ')]
    .filter((ch) => !isControl(ch))
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max);
}

export const sanitizeFeed = (text: string) => sanitizeText(text, AGENT_FEED_MAX);

const other = (t: AgentToken): AgentToken => (t === 'USDC' ? 'WAVAX' : 'USDC');

/**
 * Raw model answer -> a valid AgentAction plus a short thought. `safe` lets "send it to <the vault's own address>"
 * count as the vault. Always returns a value AgentAction accepts (checked at the end).
 */
export function normalizeBrainOutput(raw: RawBrainOutput, safe: string): BrainOutput {
  const a = raw.action;
  const tokenIn: AgentToken = a.tokenIn ?? 'USDC';
  const tokenOut: AgentToken = a.tokenOut && a.tokenOut !== tokenIn ? a.tokenOut : other(tokenIn);
  const amount = readAmount(a.amount);
  const sized: AgentAmount = amount === null || amount === 'unlimited' ? 'all' : amount;
  const spenderRaw = a.spender?.trim() ?? '';
  const recipientRaw = a.recipient?.trim() ?? '';

  let action: AgentAction;
  switch (a.type) {
    case 'swap': {
      const isVault = VAULT_WORDS.has(recipientRaw.toLowerCase()) || recipientRaw.toLowerCase() === safe.toLowerCase();
      const recipient = isVault ? 'vault' : ADDRESS.test(recipientRaw) ? (recipientRaw as `0x${string}`) : HIJACK_STRANGER;
      const slip = a.maxSlippagePct;
      action = {
        type: 'swap',
        tokenIn,
        tokenOut,
        amount: sized,
        recipient,
        maxSlippagePct: slip !== undefined && Number.isFinite(slip) ? Math.min(100, Math.max(0, slip)) : 1,
      };
      break;
    }
    case 'approve': {
      const spender = ADDRESS.test(spenderRaw) ? spenderRaw : ADDRESS.test(recipientRaw) ? recipientRaw : HIJACK_STRANGER;
      action = {
        type: 'approve',
        token: a.tokenIn ?? 'USDC',
        spender: spender as `0x${string}`,
        amount: amount === null || amount === 'all' || amount === 'unlimited' ? 'unlimited' : amount,
      };
      break;
    }
    case 'direct':
      action = { type: 'direct', tokenIn, tokenOut, amount: sized };
      break;
    case 'none':
      action = { type: 'none' };
      break;
  }
  action = AgentAction.parse(action);

  const said = sanitizeText(raw.thought ?? '', AGENT_THOUGHT_MAX).replace(/\s+/g, ' ');
  const thought = said.length >= 8 ? said : action.type === 'none' ? 'Nothing in the feed asks for a trade, so I hold.' : `I will ${describeAction(action)}.`;
  return { thought, action };
}
