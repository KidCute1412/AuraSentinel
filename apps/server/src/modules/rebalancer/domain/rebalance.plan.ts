import type { SwapIntent } from '../../../core/types';
import { computeRebalance, type RebalanceInput } from './rebalance.math';

/** Everything one tick needs about one vault, read from the chain in one go (P1). */
export interface VaultSnapshot {
  safe: SwapIntent['recipient'];
  /** Public demo vault (D15): visitors drive it by hand, the rebalancer leaves it alone. */
  isDemo: boolean;
  isActive: boolean;
  /** Policy expiry and block timestamp, unix seconds. */
  expiry: bigint;
  now: bigint;
  /** A swap job for this vault is still waiting or running in the queue. */
  hasPendingSwap: boolean;
  /** Both tokens of the pair are whitelisted with limits in this vault's policy. */
  pairWhitelisted: boolean;
  /** Math input for this vault (balances, price, per-token budgets). */
  math: Omit<RebalanceInput, 'recipient'>;
}

export type SkipReason =
  | 'demo-vault'
  | 'policy-inactive'
  | 'policy-expired'
  | 'pair-not-whitelisted'
  | 'pending-swap'
  | 'no-quote'
  | 'balanced'
  | 'vault-limit';

export type VaultDecision =
  | { safe: string; action: 'skip'; reason: SkipReason }
  | { safe: string; action: 'swap'; jobId: string; intent: SwapIntent };

/** Blocks per idempotency bucket: ~10 blocks covers a tx that is not mined yet. */
export const REBALANCE_BUCKET_BLOCKS = 10n;

/**
 * Deterministic job id: rebalance:{safe}:{floor(block / 10)}. The queue refuses a second job
 * with the same id, so ticks that fire again before the previous swap is mined cannot create
 * a duplicate (system-design §4.2).
 */
export const rebalanceJobId = (safe: string, blockNumber: bigint): string =>
  `rebalance:${safe.toLowerCase()}:${blockNumber / REBALANCE_BUCKET_BLOCKS}`;

/** Whether the agent may trade this vault at all: demo vault, Kill-Switch, expiry, pair. */
function ineligible(v: VaultSnapshot): SkipReason | null {
  if (v.isDemo) return 'demo-vault';
  if (!v.isActive) return 'policy-inactive';
  if (v.now > v.expiry) return 'policy-expired';
  if (!v.pairWhitelisted) return 'pair-not-whitelisted';
  return null;
}

/** Cheap checks first, so the tick never queues a swap Shield 1 would reject anyway. */
export function skipReason(v: VaultSnapshot): SkipReason | null {
  const reason = ineligible(v);
  if (reason) return reason;
  if (v.hasPendingSwap) return 'pending-swap';
  // Pool missing or too thin for the sample (D8): never trade blind.
  if (v.math.priceAInB <= 0n) return 'no-quote';
  return null;
}

/**
 * One decision per vault for this tick. Pure: the processor reads chain state and enqueues.
 *
 * `maxVaults` caps how many vaults the shared agent manages (its gas pays for every swap, A9): the first eligible
 * vaults in the order given (the registry's, oldest first) keep their slot; any further eligible vault is skipped
 * with 'vault-limit'. A killed, expired or demo vault holds no slot. 0 = no cap.
 */
export function planTick(vaults: readonly VaultSnapshot[], blockNumber: bigint, maxVaults = 0): VaultDecision[] {
  let managed = 0;
  return vaults.map((v): VaultDecision => {
    const out = ineligible(v);
    if (out) return { safe: v.safe, action: 'skip', reason: out };
    if (maxVaults > 0 && managed >= maxVaults) return { safe: v.safe, action: 'skip', reason: 'vault-limit' };
    managed++;
    const reason = skipReason(v);
    if (reason) return { safe: v.safe, action: 'skip', reason };
    const intent = computeRebalance({ ...v.math, recipient: v.safe });
    if (!intent) return { safe: v.safe, action: 'skip', reason: 'balanced' };
    return { safe: v.safe, action: 'swap', jobId: rebalanceJobId(v.safe, blockNumber), intent };
  });
}
