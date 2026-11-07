import { Injectable } from '@nestjs/common';
import type { Explanation } from '../../../core/types';
import type { ExplainerPort, ExplainInput } from '../explainer.port';

/** Always-available fallback. Fixed Vietnamese sentences; numbers filled from deterministic data. */
@Injectable()
export class TemplateExplainer implements ExplainerPort {
  async explain(input: ExplainInput): Promise<Explanation> {
    const messageVi =
      input.verdict === 'approved'
        ? 'Giao dịch hợp lệ và đã được thực hiện theo chính sách.'
        : `Giao dịch bị chặn${input.reasonCode ? ` (${input.reasonCode})` : ''} vì vi phạm chính sách.`;
    return {
      verdict: input.verdict === 'approved' ? 'safe' : 'blocked',
      budgetUsedPct: input.budgetUsedPct ?? 0,
      messageVi,
      source: 'template',
    };
  }
}
