import type { CheckRow, CheckValue } from '@agentshield/shared';
import type { SwapIntent } from '../../../core/types';
import type { SimOutcome } from './invariants';
import { findLimit, spentFor, type PrecheckSnapshot } from './precheck';

/**
 * The evidence behind each shield's verdict: one row per rule, with what the job had against what the rule allows.
 * Pure. The verdict functions (precheck, checkInvariants) are derived from these rows, so what the page shows and
 * what was decided cannot drift apart. Money stays bigint until it becomes a base-unit string here (P5).
 */

/** Symbol and decimals of a token, for display. Unknown tokens still get a row, labelled by address. */
export type TokenInfo = (token: string) => { symbol: string; decimals: number };
export const unknownToken: TokenInfo = (token) => ({ symbol: `${token.slice(0, 6)}…`, decimals: 0 });

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const addr = (value: string): CheckValue => ({ type: 'address', value: value as `0x${string}` });
const amount = (v: bigint, token: string, info: TokenInfo): CheckValue => ({ type: 'amount', amount: v.toString(), token: token as `0x${string}`, ...info(token) });
const row = (id: string, pass: boolean, reasonCode: string, actual: CheckValue | null = null, limit: CheckValue | null = null): CheckRow => ({
  id,
  pass,
  reasonCode: pass ? null : reasonCode,
  actual,
  limit,
});

/** A token is whitelisted when its dailyCap is above zero (contracts.md §2). */
const isWhitelisted = (s: PrecheckSnapshot, token: string) => (findLimit(s.limits, token)?.dailyCap ?? 0n) > 0n;

/**
 * Shield 1 (a), in the contract's gate order (contracts.md §4), then the recipient check the module ABI cannot
 * express. Caps of a token that is not whitelisted are meaningless, so those two rows are left out then.
 */
export function precheckChecks(intent: SwapIntent, s: PrecheckSnapshot, info: TokenInfo = unknownToken): CheckRow[] {
  const rows: CheckRow[] = [
    // Gate 1: who and when
    row('agent-signer', same(s.signer, s.policy.agentSigner), 'UnauthorizedAgent', addr(s.signer), addr(s.policy.agentSigner)),
    row('kill-switch', s.policy.isActive, 'PolicyInactive', { type: 'bool', value: s.policy.isActive }),
    row('policy-expiry', !(s.now > s.policy.expiry), 'PolicyExpired', { type: 'time', unix: Number(s.now) }, { type: 'time', unix: Number(s.policy.expiry) }),
  ];

  // Gate 2: which tokens
  const tokensAllowed = isWhitelisted(s, intent.tokenIn) && isWhitelisted(s, intent.tokenOut);
  const pair: CheckValue = { type: 'text', value: `${info(intent.tokenIn).symbol} → ${info(intent.tokenOut).symbol}` };
  rows.push(row('tokens-allowed', tokensAllowed, 'TokenNotWhitelisted', pair));
  rows.push(row('different-tokens', !same(intent.tokenIn, intent.tokenOut), 'SameToken', pair));

  // Gates 3-4: how much
  const limit = findLimit(s.limits, intent.tokenIn);
  if (tokensAllowed && limit) {
    rows.push(row('per-trade-cap', !(intent.amountIn > limit.maxPerTx), 'ExceedsPerTxCap', amount(intent.amountIn, intent.tokenIn, info), amount(limit.maxPerTx, intent.tokenIn, info)));
    const after = spentFor(s.spentToday, intent.tokenIn) + intent.amountIn;
    rows.push(row('daily-cap', !(after > limit.dailyCap), 'ExceedsDailyCap', amount(after, intent.tokenIn, info), amount(limit.dailyCap, intent.tokenIn, info)));
  }
  rows.push(row('min-out', intent.minAmountOut > 0n, 'ZeroMinOut', amount(intent.minAmountOut, intent.tokenOut, info)));

  // Intent: the module has no recipient parameter, so only Shield 1 can catch this (attack #2).
  rows.push(row('recipient', same(intent.recipient, s.safe), 'RECIPIENT_NOT_SAFE', addr(intent.recipient), addr(s.safe)));
  return rows;
}

/** Shield 1 (b): did the swap run on the fork, and what moved. */
export function simulationChecks(
  intent: Pick<SwapIntent, 'tokenIn' | 'tokenOut'>,
  sim: { ok: true; outcome: SimOutcome } | { ok: false; revertReason: string | null },
  info: TokenInfo = unknownToken,
): CheckRow[] {
  if (!sim.ok) return [row('sim-executes', false, sim.revertReason ?? 'UNKNOWN_REVERT', sim.revertReason ? { type: 'text', value: sim.revertReason } : null)];
  return [
    row('sim-executes', true, ''),
    row('sim-token-in', true, '', amount(sim.outcome.deltaSafeTokenIn, intent.tokenIn, info)),
    row('sim-token-out', true, '', amount(sim.outcome.deltaSafeTokenOut, intent.tokenOut, info)),
  ];
}

/** Shield 1 (c): where the money went in the simulation. Money may only change form, never leave the Safe. */
export function invariantChecks(intent: Pick<SwapIntent, 'amountIn' | 'tokenIn' | 'tokenOut'>, sim: SimOutcome, info: TokenInfo = unknownToken): CheckRow[] {
  return [
    row('inv-output', sim.deltaSafeTokenOut > 0n, 'INVARIANT_NO_OUTPUT', amount(sim.deltaSafeTokenOut, intent.tokenOut, info), { type: 'text', value: '> 0' }),
    row('inv-input', sim.deltaSafeTokenIn === -intent.amountIn, 'INVARIANT_INPUT_MISMATCH', amount(sim.deltaSafeTokenIn, intent.tokenIn, info), amount(-intent.amountIn, intent.tokenIn, info)),
    row('inv-attacker', sim.deltaAttacker === 0n, 'INVARIANT_ATTACKER_GAINED', amount(sim.deltaAttacker, intent.tokenOut, info), amount(0n, intent.tokenOut, info)),
    row('inv-allowance', sim.allowanceAfter === 0n, 'INVARIANT_ALLOWANCE_LEFT', amount(sim.allowanceAfter, intent.tokenIn, info), amount(0n, intent.tokenIn, info)),
  ];
}

/** What a mined swap really did to one of the Safe's tokens: the receipt's net flow, and the balance at that block. */
export interface ChainMove {
  token: string;
  delta: bigint;
  /** Safe balance at the receipt's block; null when the read failed (the delta still stands). */
  balanceAfter: bigint | null;
}

/** Net amount of `token` the Safe gained (positive) or paid (negative) in a receipt's Transfer logs. */
export function netFlow(transfers: readonly { token: string; from: string; to: string; value: bigint }[], safe: string, token: string): bigint {
  let net = 0n;
  for (const t of transfers) {
    if (!same(t.token, token)) continue;
    if (same(t.to, safe)) net += t.value;
    if (same(t.from, safe)) net -= t.value;
  }
  return net;
}

/**
 * Shield 2: the transaction itself. The contract re-runs every gate; this records what the chain answered and, for a
 * mined swap, what it measurably moved (`moves`: tokenIn then tokenOut). Measured rows are facts, so they always pass.
 */
export function onchainChecks(
  tx: { txHash: string; blockNumber: bigint; status: 'success' | 'reverted'; revertReason?: string },
  moves: readonly ChainMove[] = [],
  info: TokenInfo = unknownToken,
): CheckRow[] {
  const rows = [
    row('tx-sent', true, '', { type: 'text', value: tx.txHash }),
    row('tx-block', true, '', { type: 'text', value: tx.blockNumber.toString() }),
    row('tx-result', tx.status === 'success', tx.revertReason ?? 'UNKNOWN_REVERT', { type: 'text', value: tx.status === 'success' ? 'success' : (tx.revertReason ?? 'UNKNOWN_REVERT') }),
  ];
  if (tx.status !== 'success') return rows;
  for (const m of moves) {
    rows.push(row(m.delta < 0n ? 'chain-paid' : 'chain-received', true, '', amount(m.delta, m.token, info)));
    if (m.balanceAfter !== null) rows.push(row('chain-balance', true, '', amount(m.balanceAfter, m.token, info)));
  }
  return rows;
}

/** Reasons of the failed rows, in check order: reasons[0] is what the job reports. */
export const failedReasons = (rows: readonly CheckRow[]): string[] => rows.flatMap((r) => (r.pass || !r.reasonCode ? [] : [r.reasonCode]));
