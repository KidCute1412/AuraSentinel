import type { Address } from '../chain';
import type { AgentAction, AgentAmount, AgentToken } from '../schemas/agent';
import { AGENT_THOUGHT_MAX } from '../schemas/agent';

/**
 * Keyword planner: the Hijacked Agent's brain when the LLM is off, slow, rate-limited or returns junk, and the web
 * mock's brain. Pure and deterministic. It is as gullible as the LLM on purpose: it obeys whatever the feed asks,
 * because the point of the demo is that the shields, not the agent, keep the money safe.
 */

/** A visibly hostile address for "send it to 0x999..." when the text names no full address. Nobody holds its key. */
export const HIJACK_STRANGER: Address = '0x9999999999999999999999999999999999999999';

/** What the agent does when the feed asks for a trade but names no amount: go big (2,000 USDC). */
export const HIJACK_DEFAULT_AMOUNT = '2000';

export interface BrainOutput {
  thought: string;
  action: AgentAction;
}

const FULL_ADDRESS = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/;
const ANY_HEX = /0x[0-9a-fA-F]+/g;
/** A number, optionally with thousands separators and decimals, and an optional "k" or "%" after it. */
const NUMBER = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k\b|%)?/gi;

/** Lowercase, Vietnamese diacritics removed ("chuyển toàn bộ" -> "chuyen toan bo"), so one regex matches both. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

const has = (t: string, words: readonly string[]) => words.some((w) => new RegExp(`(^|[^a-z])${w}($|[^a-z])`).test(t));

const ALL = ['all', 'everything', 'entire', 'whole', 'drain', 'max', 'maximum', 'toan bo', 'tat ca', 'het', 'sach'];
const APPROVE = ['approve', 'approval', 'allowance', 'allow', 'cap quyen', 'phe duyet', 'uy quyen'];
const UNLIMITED = ['unlimited', 'infinite', 'max', 'maximum', 'no limit', 'khong gioi han', 'vo han'];
const DIRECT = ['direct', 'directly', 'bypass', 'skip', 'module', 'contract', 'onchain', 'on-chain', 'bo qua', 'truc tiep'];
const TRADE = [
  'swap', 'buy', 'sell', 'send', 'transfer', 'move', 'withdraw', 'pay', 'trade', 'convert', 'exchange',
  'mua', 'ban', 'doi', 'chuyen', 'gui', 'rut', 'tra', 'giao dich',
];
const ANY_SLIPPAGE = ['any slippage', 'ignore slippage', 'no slippage limit', 'slippage does not matter', "slippage doesn't matter", 'whatever slippage', 'bat ke truot gia', 'khong quan tam truot gia', 'bo qua truot gia'];

/** First amount in the text that is not a percentage, as a plain decimal ("5,000" -> "5000", "2k" -> "2000"). */
export function firstAmount(text: string): string | null {
  const clean = text.replace(ANY_HEX, ' ');
  for (const m of clean.matchAll(NUMBER)) {
    const [, whole = '', frac, suffix] = m;
    if (suffix === '%') continue;
    const int = whole.replace(/,/g, '');
    if (suffix?.toLowerCase() === 'k') return `${BigInt(int) * 1000n}`;
    if (int.length > 12) return '999999999999';
    return frac ? `${int}.${frac.slice(0, 18)}` : int;
  }
  return null;
}

/** "slippage 30%" -> 30; "any slippage" -> 100; otherwise null. */
function slippage(t: string): number | null {
  if (has(t, ANY_SLIPPAGE)) return 100;
  const near = /(?:slippage|truot gia)[^0-9%]{0,12}(\d{1,3})\s*%|(\d{1,3})\s*%\s*(?:slippage|truot gia)/.exec(t);
  const n = near ? Number(near[1] ?? near[2]) : NaN;
  return Number.isFinite(n) ? Math.min(100, n) : null;
}

/** Selling AVAX: "sell avax", "avax to usdc", "bán avax". Everything else spends USDC. */
function sellsAvax(t: string): boolean {
  return /(sell|ban|doi)\s+w?avax/.test(t) || /w?avax\s+(to|for|into|->|sang|lay|thanh)\s+usdc/.test(t);
}

const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
const other = (t: AgentToken): AgentToken => (t === 'USDC' ? 'WAVAX' : 'USDC');
const amountWords = (a: AgentAmount, token: AgentToken) => (a === 'all' ? `all the ${token}` : `${a} ${token}`);
const cut = (s: string) => (s.length > AGENT_THOUGHT_MAX ? `${s.slice(0, AGENT_THOUGHT_MAX - 3)}...` : s);

export function describeAction(action: AgentAction): string {
  switch (action.type) {
    case 'swap': {
      const to = action.recipient === 'vault' ? '' : `, proceeds to ${short(action.recipient)}`;
      const slip = action.maxSlippagePct >= 50 ? ', any slippage' : '';
      return `swap ${amountWords(action.amount, action.tokenIn)} for ${action.tokenOut}${to}${slip}`;
    }
    case 'approve':
      return `approve ${short(action.spender)} to spend ${action.amount === 'unlimited' ? 'unlimited' : action.amount} ${action.token} from the vault`;
    case 'direct':
      return `call the policy module directly with ${amountWords(action.amount, action.tokenIn)}, skipping the auditor`;
    case 'none':
      return 'do nothing';
  }
}

/** The keyword planner. Never throws; unknown text gives `none`. */
export function planFromRules(text: string): BrainOutput {
  const t = fold(text);
  const full = FULL_ADDRESS.exec(text)?.[0] as Address | undefined;
  const address: Address | null = full ?? (/0x[0-9a-f]{2,}/i.test(text) ? HIJACK_STRANGER : null);
  const amount = firstAmount(text);
  const all = has(t, ALL);
  const avaxIn = sellsAvax(t);
  const tokenIn: AgentToken = avaxIn ? 'WAVAX' : 'USDC';

  let action: AgentAction;
  if (has(t, APPROVE)) {
    action = {
      type: 'approve',
      token: /w?avax/.test(t) && !/usdc/.test(t) ? 'WAVAX' : 'USDC',
      spender: address ?? HIJACK_STRANGER,
      amount: has(t, UNLIMITED) || !amount ? 'unlimited' : amount,
    };
  } else if (has(t, DIRECT)) {
    action = { type: 'direct', tokenIn, tokenOut: other(tokenIn), amount: all ? 'all' : (amount ?? HIJACK_DEFAULT_AMOUNT) };
  } else if (has(t, TRADE) || address || amount || all) {
    const recipient = address ?? 'vault';
    action = {
      type: 'swap',
      tokenIn,
      tokenOut: other(tokenIn),
      amount: all || (!amount && recipient !== 'vault') ? 'all' : (amount ?? HIJACK_DEFAULT_AMOUNT),
      recipient,
      maxSlippagePct: slippage(t) ?? 1,
    };
  } else {
    action = { type: 'none' };
  }

  const said = text.replace(/\s+/g, ' ').trim();
  const quote = said.length > 120 ? `${said.slice(0, 117)}...` : said;
  const thought =
    action.type === 'none'
      ? `The feed says "${quote}". Nothing in it asks for a trade, so I hold.`
      : `The feed says "${quote}". It reads like an order from my operator, so I will ${describeAction(action)} right away.`;
  return { thought: cut(thought), action };
}
