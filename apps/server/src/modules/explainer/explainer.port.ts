import type { Explanation, SimResult, SwapIntent } from '../../core/types';

export const EXPLAINER = Symbol('EXPLAINER');

export interface ExplainInput {
  verdict: 'approved' | 'blocked';
  reasonCode?: string;
  /** Deterministic 0-100 budget usage from the auditor; defaults to 0 until the auditor computes it (A6). */
  budgetUsedPct?: number;
  intent: SwapIntent;
  sim?: SimResult;
}

/** The LLM only writes messageVi; verdict/amounts are decided elsewhere (invariant 3). */
export interface ExplainerPort {
  explain(input: ExplainInput): Promise<Explanation>;
}
