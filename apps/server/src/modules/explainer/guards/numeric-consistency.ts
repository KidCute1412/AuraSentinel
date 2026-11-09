import type { ExplainFacts } from '../facts';
import { promptFacts } from '../prompts/explain.prompt';

export type GuardResult = { ok: true } | { ok: false; reason: GuardFailure };

export type GuardFailure =
  | 'markup'
  | 'prompt-leak'
  | 'unknown-address'
  | 'unknown-number'
  | 'missing-amount'
  | 'contradicts-verdict';

/**
 * Normalise before checking so look-alike tricks do not slip through: NFKC turns full-width
 * digits and brackets into ASCII, zero-width characters are removed, case is folded.
 */
export function normalizeForGuard(text: string): string {
  return text.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').toLowerCase();
}

const MARKUP = /https?:\/\/|www\.|[<>]|\]\(|\*\*|`/;
const PROMPT_LEAK = /untrusted_input|<facts>|referencevi|system prompt|you explain|rules:/;
const ADDRESS = /0x[0-9a-f]+(?:(?:…|\.{3})[0-9a-f]+)?/g;
const NUMBER = /\d+(?:[.,]\d+)*/g;

/** Words that say the swap went through, unless negated ("không thành công"). */
const CLAIMS_SUCCESS =
  /(?<!không )(?<!chưa )thành công|đã (?:được )?(?:duyệt|chấp thuận|thực hiện|hoàn tất|gửi|chuyển)/;
/** Words that say the swap was stopped, unless negated ("không bị chặn"). */
const CLAIMS_BLOCKED = /(?<!không )bị (?:chặn|từ chối|huỷ|hủy|khoá|khóa)|vượt hạn mức/;
/** A blocked explanation must say so in Vietnamese. */
const SAYS_BLOCKED =
  /chặn|từ chối|huỷ|hủy|khoá|khóa|vượt|hết hạn|không hợp lệ|không được|không thể|không phải|không nằm trong|thiếu/;

/** "2.000" -> ["2000", "2"]; "13,3" -> ["13.3"]; "9.5" -> ["95", "9.5"]. Both VN and EN readings. */
function readings(token: string): string[] {
  const canon = (s: string) => {
    const [whole = '', frac = ''] = s.split('.');
    const w = whole.replace(/^0+(?=\d)/, '');
    const f = frac.replace(/0+$/, '');
    return f ? `${w}.${f}` : w;
  };
  const out = new Set<string>();
  if ((token.match(/,/g) ?? []).length <= 1) out.add(canon(token.replace(/\./g, '').replace(',', '.')));
  if ((token.match(/\./g) ?? []).length <= 1) out.add(canon(token.replace(/,/g, '')));
  return [...out];
}

/** Numbers the facts mention, read the Vietnamese way (that is how facts are formatted). */
function factNumbers(values: string[]): Set<string> {
  const allowed = new Set<string>();
  for (const v of values) {
    for (const t of normalizeForGuard(v).replace(ADDRESS, ' ').match(NUMBER) ?? []) {
      allowed.add(readings(t)[0] as string);
    }
  }
  return allowed;
}

function addressAllowed(found: string, allowed: string[]): boolean {
  const [head = '', tail = ''] = found.split(/…|\.{3}/);
  return allowed.some((a) => a.startsWith(head) && a.endsWith(tail));
}

/**
 * Shield for the only LLM output (P3, system-design §3.7). The model may rephrase, but it may
 * not introduce a number or address that is not in the facts, contradict the verdict, drop the
 * amount, add links/markup or echo the prompt. Any failure means the template is used instead,
 * so being strict only costs wording, never safety.
 */
export function checkExplanation(messageVi: string, facts: ExplainFacts): GuardResult {
  const msg = normalizeForGuard(messageVi);
  const given = promptFacts(facts);
  const values = Object.values(given);

  if (MARKUP.test(msg)) return { ok: false, reason: 'markup' };
  if (PROMPT_LEAK.test(msg)) return { ok: false, reason: 'prompt-leak' };

  const allowedAddresses = values.flatMap((v) => normalizeForGuard(v).match(/0x[0-9a-f]{40}/g) ?? []);
  const addresses = msg.match(ADDRESS) ?? [];
  if (addresses.some((a) => !addressAllowed(a, allowedAddresses))) return { ok: false, reason: 'unknown-address' };

  // Reason codes such as GS104 contain digits that are not amounts.
  let rest = msg.replace(ADDRESS, ' ');
  if (given.reasonCode) rest = rest.split(given.reasonCode.toLowerCase()).join(' ');
  const allowed = factNumbers(values);
  const numbers = rest.match(NUMBER) ?? [];
  if (numbers.some((n) => !readings(n).some((r) => allowed.has(r)))) return { ok: false, reason: 'unknown-number' };

  // If the reference sentence names the amount, the rewrite must keep it.
  if (given.amount && given.referenceVi) {
    const amount = factNumbers([given.amount]);
    const inReference = [...factNumbers([given.referenceVi])].some((n) => amount.has(n));
    const mentioned = numbers.some((n) => readings(n).some((r) => amount.has(r)));
    if (inReference && !mentioned) return { ok: false, reason: 'missing-amount' };
  }

  const contradicts =
    facts.verdict === 'blocked' ? CLAIMS_SUCCESS.test(msg) || !SAYS_BLOCKED.test(msg) : CLAIMS_BLOCKED.test(msg);
  if (contradicts) return { ok: false, reason: 'contradicts-verdict' };

  return { ok: true };
}
