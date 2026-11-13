import type { StateDto } from '@agentshield/shared';
import { bpsToPct, budgetUsedBps } from '../../auditor/domain/verdict';

type Address = StateDto['safe'];

/** Raw chain reads for one vault at one block. Base units (P5). */
export interface VaultReads {
  safe: Address;
  blockNumber: bigint;
  /** Block timestamp, unix seconds. */
  now: bigint;
  epoch: bigint;
  policy: { agentSigner: Address; expiry: bigint; isActive: boolean };
  limits: readonly { token: Address; maxPerTx: bigint; dailyCap: bigint }[];
  spentToday: readonly { token: Address; amount: bigint }[];
  balances: readonly { token: Address; symbol: string; decimals: number; amount: bigint }[];
  /** Token whose budget the UI shows (USDC). Falls back to the most used token. */
  budgetToken?: Address;
}

const DAY = 86_400n;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The module's day bucket: block.timestamp / 1 days (contracts.md §4). */
export const dayIdOf = (now: bigint): number => Number(now / DAY);

/**
 * Budget share for the state header, in basis points: the budget token when it is whitelisted,
 * otherwise the highest share across tokens (never under-report how close the vault is to a cap).
 */
export function stateBudgetBps(r: Pick<VaultReads, 'limits' | 'spentToday' | 'budgetToken'>): bigint {
  const bpsFor = (l: VaultReads['limits'][number]) =>
    budgetUsedBps({
      verdict: 'blocked', // nothing new is spent by reading state
      spentToday: r.spentToday.find((s) => same(s.token, l.token))?.amount ?? 0n,
      amountIn: 0n,
      dailyCap: l.dailyCap,
    });
  const main = r.budgetToken && r.limits.find((l) => same(l.token, r.budgetToken!));
  if (main) return bpsFor(main);
  return r.limits.reduce((max, l) => (bpsFor(l) > max ? bpsFor(l) : max), 0n);
}

/** GET /vaults/{safe}/state (api.md #7). Pure: money leaves as base-unit strings. */
export function toStateDto(r: VaultReads, stale = false): StateDto {
  const dayId = dayIdOf(r.now);
  return {
    safe: r.safe,
    blockNumber: r.blockNumber.toString(),
    isActive: r.policy.isActive,
    policyEpoch: Number(r.epoch),
    policy: {
      agentSigner: r.policy.agentSigner,
      expiry: Number(r.policy.expiry),
      limits: r.limits.map((l) => ({ token: l.token, maxPerTx: l.maxPerTx.toString(), dailyCap: l.dailyCap.toString() })),
    },
    spentToday: r.spentToday.map((s) => ({ token: s.token, dayId, amount: s.amount.toString() })),
    balances: r.balances.map((b) => ({ ...b, amount: b.amount.toString() })),
    budgetUsedPct: bpsToPct(stateBudgetBps(r)),
    stale,
  };
}
