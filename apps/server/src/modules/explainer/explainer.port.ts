import type { Explanation, SimResult, SwapIntent } from '../../core/types';

export const EXPLAINER = Symbol('EXPLAINER');

export interface TokenMeta {
  symbol: string;
  decimals: number;
}

export interface ExplainInput {
  /** Deterministic verdict from auditor/domain/verdict.ts. The explainer never changes it. */
  verdict: 'approved' | 'blocked';
  /** Reason code from @agentshield/shared (unknown strings become UNKNOWN_REVERT). */
  reasonCode?: string | null;
  /** Deterministic 0-100 budget usage from the auditor (bpsToPct); 0 until the auditor computes it (A6). */
  budgetUsedPct?: number;
  intent: SwapIntent;
  sim?: SimResult;

  // Optional display context. Without it the template uses its number-free sentences.
  /** Symbols and decimals of intent.tokenIn / intent.tokenOut, to format amounts. */
  tokens?: { in: TokenMeta; out: TokenMeta };
  /** tokenIn limits and spend read from the chain for this vault, in base units (P1). */
  limits?: { maxPerTx: bigint; dailyCap: bigint; spentToday: bigint };
  /** Policy expiry in unix seconds, for PolicyExpired. */
  expiry?: bigint;
  /** Text a visitor typed into the red-team injection box. Untrusted: prompt data only. */
  untrustedText?: string;
}

/** The LLM only writes messageVi; verdict/amounts are decided elsewhere (invariant 3). */
export interface ExplainerPort {
  explain(input: ExplainInput): Promise<Explanation>;
}
