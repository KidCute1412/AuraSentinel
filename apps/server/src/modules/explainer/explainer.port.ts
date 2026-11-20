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
  /**
   * Hijacked Agent runs: what the fooled agent planned, in words written by code from the validated plan
   * (describeAction), e.g. "swap all the USDC for WAVAX, proceeds to 0x9999...9999". Display fact only.
   */
  agentAction?: string;
  /**
   * A red-team plan that passed every shield and was stopped before broadcast on purpose (job status `held`). Only
   * with verdict `approved`. The template explains it: an LLM could claim the trade was sent.
   */
  held?: boolean;
}

/** The LLM only writes messageVi; verdict/amounts are decided elsewhere (invariant 3). */
export interface ExplainerPort {
  explain(input: ExplainInput): Promise<Explanation>;
}

/** The LLM adapter ExplainerService tries first (the LLM_BASE_URL endpoint when configured, else Gemini). */
export const LLM_EXPLAINER = Symbol('LLM_EXPLAINER');

export interface LlmExplainer extends ExplainerPort {
  /** False when the adapter is not configured: the service then goes straight to the template. */
  readonly available: boolean;
  /** Model id, for logs. */
  readonly label: string;
  /** Max calls per minute to this provider. */
  readonly rpm: number;
}
