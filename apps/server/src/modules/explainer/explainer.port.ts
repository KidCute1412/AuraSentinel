import type { Explanation, SimResult, SwapIntent } from '../../core/types';

export const EXPLAINER = Symbol('EXPLAINER');

export interface ExplainInput {
  verdict: 'approved' | 'blocked';
  reasonCode?: string;
  intent: SwapIntent;
  sim?: SimResult;
}

/** The LLM only writes messageVi; verdict/amounts are decided elsewhere (invariant 3). */
export interface ExplainerPort {
  explain(input: ExplainInput): Promise<Explanation>;
}
