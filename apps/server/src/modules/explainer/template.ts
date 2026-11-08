import { formatReasonVi } from '@agentshield/shared';
import type { Explanation } from '../../core/types';
import type { ExplainInput } from './explainer.port';
import { buildFacts, type ExplainFacts } from './facts';

/** Sentence for an approved swap. Uses only the facts that are present. */
function safeMessageVi(f: ExplainFacts): string {
  const amount = f.params.amount;
  const what = amount && f.received ? `: đổi ${amount} lấy khoảng ${f.received}` : '';
  const budget = f.budgetPct ? ` Sau lệnh này đã dùng ${f.budgetPct} hạn mức hôm nay.` : '';
  return `Lệnh đã qua đủ các lớp kiểm tra${what}, tiền vẫn nằm trong két.${budget}`;
}

/** The Vietnamese sentence the template adapter would write. Also the reference given to the LLM. */
export function templateMessageVi(f: ExplainFacts): string {
  return f.verdict === 'safe' ? safeMessageVi(f) : formatReasonVi(f.reasonCode, f.params);
}

/**
 * Always-available explanation: fixed Vietnamese sentences (reason copy lives in
 * packages/shared/src/errors.ts) with numbers filled from deterministic data. Never throws.
 */
export function explainWithTemplate(input: ExplainInput): Explanation {
  const facts = buildFacts(input);
  return {
    verdict: facts.verdict,
    budgetUsedPct: facts.budgetUsedPct,
    messageVi: templateMessageVi(facts),
    source: 'template',
  };
}
