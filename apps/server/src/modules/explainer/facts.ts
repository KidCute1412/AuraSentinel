import {
  formatAmountVi,
  fromSignedAmount,
  toReasonCode,
  type ReasonCode,
  type ReasonParams,
} from '@agentshield/shared';
import type { ExplainInput } from './explainer.port';

/**
 * Everything an explanation may say, computed deterministically from the auditor's data.
 * Both the template and the LLM prompt read from here, and the numeric guard (Q6) only
 * accepts numbers that appear in these strings. Values are display strings, never parsed back.
 */
export interface ExplainFacts {
  verdict: 'safe' | 'blocked';
  /** null when the verdict is safe. */
  reasonCode: ReasonCode | null;
  /** Filled placeholders for formatReasonVi, already formatted ("2.000 USDC"). */
  params: ReasonParams;
  /** Amount of tokenOut the simulation says the Safe receives ("9,5 WAVAX"). */
  received?: string;
  /** Budget after this decision, Vietnamese display ("13,3%"). */
  budgetPct?: string;
  /** Explanation.budgetUsedPct, passed through unchanged. */
  budgetUsedPct: number;
}

/** 13.3 -> "13,3%", 50 -> "50%". Display only: the input is already a bounded percentage. */
export function formatPctVi(pct: number): string {
  const tenths = Math.round(Math.min(Math.max(pct, 0), 100) * 10);
  const whole = Math.trunc(tenths / 10);
  const tenth = tenths % 10;
  return tenth === 0 ? `${whole}%` : `${whole},${tenth}%`;
}

/** Unix seconds -> "23:59 31/12/2099 (giờ VN)", fixed UTC+7 so output is the same on every server. */
export function formatExpiryVi(expiry: bigint): string {
  const d = new Date(Number(expiry + 7n * 3600n) * 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  const time = `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
  const date = `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return `${time} ${date} (giờ VN)`;
}

export function buildFacts(input: ExplainInput): ExplainFacts {
  const verdict = input.verdict === 'approved' ? 'safe' : 'blocked';
  const reasonCode = verdict === 'blocked' ? toReasonCode(input.reasonCode) : null;
  const params: ReasonParams = { recipient: input.intent.recipient };
  let received: string | undefined;

  const t = input.tokens;
  if (t) {
    const inAmt = (v: bigint) => formatAmountVi(v, t.in.decimals, t.in.symbol);
    const outAmt = (v: bigint) => formatAmountVi(v, t.out.decimals, t.out.symbol);
    params.amount = inAmt(input.intent.amountIn);
    params.minOut = outAmt(input.intent.minAmountOut);
    if (input.limits) {
      params.maxPerTx = inAmt(input.limits.maxPerTx);
      params.dailyCap = inAmt(input.limits.dailyCap);
      params.spent = inAmt(input.limits.spentToday);
    }
    if (input.sim) {
      const deltaIn = fromSignedAmount(input.sim.deltaSafeTokenIn);
      const deltaOut = fromSignedAmount(input.sim.deltaSafeTokenOut);
      params.actual = inAmt(deltaIn < 0n ? -deltaIn : deltaIn);
      if (deltaOut > 0n) received = outAmt(deltaOut);
    }
  }
  if (input.expiry !== undefined) params.expiry = formatExpiryVi(input.expiry);

  const budgetUsedPct = input.budgetUsedPct ?? 0;
  return {
    verdict,
    reasonCode,
    params,
    received,
    budgetPct: input.budgetUsedPct === undefined ? undefined : formatPctVi(budgetUsedPct),
    budgetUsedPct,
  };
}
