import type { ServerEvent } from '@agentshield/shared';

type Address = `0x${string}`;
type Hash = `0x${string}`;

/** The public Fuji RPC rejects eth_getLogs over more than 100 blocks (measured 13/11). */
export const MAX_SPAN = 100n;

export interface BlockRange {
  from: bigint;
  to: bigint;
}

/**
 * Next block range to index. Resumes after the cursor; with no cursor starts at `start` (the
 * factory deploy block) or, without one, at the head (no backfill). Null when caught up.
 * Avalanche has instant finality, so the head is final: no confirmation lag, no reorg handling.
 */
export function nextRange(cursor: bigint | undefined, head: bigint, start: bigint | undefined, maxSpan = MAX_SPAN): BlockRange | null {
  const from = cursor !== undefined ? cursor + 1n : (start ?? head);
  if (from > head) return null;
  const last = from + maxSpan - 1n;
  return { from, to: last < head ? last : head };
}

/** A decoded log, as viem returns it: checksummed addresses, bigint numbers. */
export type DecodedLog =
  | {
      eventName: 'GuardedSwap';
      args: { tokenIn: Address; tokenOut: Address; amountIn: bigint; amountOut: bigint; dayId: bigint; spentToday: bigint };
    }
  | {
      eventName: 'PolicySet';
      args: {
        agentSigner: Address;
        epoch: bigint;
        router: Address;
        expiry: bigint;
        isActive: boolean;
        tokens: readonly Address[];
        limits: readonly { maxPerTx: bigint; dailyCap: bigint }[];
      };
    }
  | { eventName: 'PolicyRevoked'; args: { by: Address; at: bigint } }
  | { eventName: 'ModuleDeployed'; args: { safe: Address; module: Address; owner: Address } };

/**
 * Decoded module/factory log -> the SSE event the UI listens to (api.md §7). Money leaves as
 * base-unit strings (P5). These events only say "something changed": the UI refetches state
 * from the chain, never derives policy or spend from them (P1).
 */
export function toServerEvent(log: DecodedLog, vault: Address, txHash: Hash): ServerEvent {
  switch (log.eventName) {
    case 'GuardedSwap': {
      const a = log.args;
      return {
        type: 'chain.swap',
        vault,
        tokenIn: a.tokenIn,
        tokenOut: a.tokenOut,
        amountIn: a.amountIn.toString(),
        amountOut: a.amountOut.toString(),
        spentToday: a.spentToday.toString(),
        txHash,
      };
    }
    case 'PolicySet': {
      const a = log.args;
      return {
        type: 'chain.policy',
        vault,
        policy: {
          agentSigner: a.agentSigner,
          expiry: Number(a.expiry),
          limits: a.tokens.map((token, i) => ({
            token,
            maxPerTx: (a.limits[i]?.maxPerTx ?? 0n).toString(),
            dailyCap: (a.limits[i]?.dailyCap ?? 0n).toString(),
          })),
        },
        txHash,
      };
    }
    case 'PolicyRevoked':
      return { type: 'chain.revoked', vault, txHash };
    case 'ModuleDeployed':
      return { type: 'vault.registered', vault: log.args.safe, module: log.args.module, owner: log.args.owner };
  }
}

/** jsonb cannot hold bigint: event args are stored with numbers as decimal strings. */
export function jsonArgs(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonArgs);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonArgs(v)]));
  }
  return value;
}
