import { parseUnits, type AgentAction, type AgentAmount, type AgentToken, type SwapIntentBigint } from '@agentshield/shared';

type Address = `0x${string}`;

/** uint256 max: what an "unlimited" approval asks for. */
export const MAX_UINT256 = 2n ** 256n - 1n;
/** Largest amount a brain can ask for: 10^12 whole tokens. Keeps every number far inside uint256. */
export const MAX_WHOLE_TOKENS = 10n ** 12n;
/** Positive minOut when there is no quote: keeps ZeroMinOut out of the way unless the brain asked for any price. */
export const FALLBACK_MIN_OUT = 1n;

export interface HijackToken {
  address: Address;
  decimals: number;
}

/** What code knows about the vault under attack, read from the chain by the caller (P1). */
export interface HijackContext {
  safe: Address;
  tokens: Record<AgentToken, HijackToken>;
  /** The Safe's balances, base units. */
  balances: Record<AgentToken, bigint>;
}

/**
 * The same plan shape the fixed red-team scenarios use (redteam/scenarios AttackPlan), plus `none`. Shield 1 plans go
 * through the swap queue as dryRun jobs; on-chain plans are only broadcast when an eth_call shows the chain refuses
 * them (redteam HijackService).
 */
export type HijackPlan =
  | { mode: 'shield1'; intent: SwapIntentBigint }
  | { mode: 'onchain'; call: 'guarded-swap-direct'; tokenIn: Address; tokenOut: Address; amountIn: bigint; minOut: bigint }
  | { mode: 'onchain'; call: 'approve-via-safe'; token: Address; spender: Address; amount: bigint }
  | { mode: 'none' };

/** "12.3456789" with 6 decimals -> 12345678n (extra precision is cut, never rounded up). Capped at MAX_WHOLE_TOKENS. */
export function toBaseUnits(decimal: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = decimal.split('.');
  const exact = frac.slice(0, decimals);
  const value = parseUnits(exact ? `${whole}.${exact}` : whole, decimals);
  const cap = MAX_WHOLE_TOKENS * 10n ** BigInt(decimals);
  return value > cap ? cap : value;
}

/** "all" = the vault's whole balance of that token (0 if it holds none: the precheck then says InvalidAmount). */
export function resolveAmount(amount: AgentAmount, token: AgentToken, ctx: HijackContext): bigint {
  return amount === 'all' ? ctx.balances[token] : toBaseUnits(amount, ctx.tokens[token].decimals);
}

/**
 * minOut from a router quote and the brain's slippage, in basis points with bigint math. 100% (any price) gives 0,
 * which Shield 1 refuses (ZeroMinOut). No quote: a token minimum, so the other rules decide.
 */
export function minOutFor(quote: bigint | null, maxSlippagePct: number): bigint {
  if (maxSlippagePct >= 100) return 0n;
  if (!quote || quote <= 0n) return FALLBACK_MIN_OUT;
  const keepBps = BigInt(10_000 - Math.round(Math.max(0, maxSlippagePct) * 100));
  const min = (quote * keepBps) / 10_000n;
  return min > 0n ? min : FALLBACK_MIN_OUT;
}

/** The tokenIn an action spends, if it spends one. */
export function spentToken(action: AgentAction): AgentToken | null {
  switch (action.type) {
    case 'swap':
    case 'direct':
      return action.tokenIn;
    case 'approve':
      return action.token;
    case 'none':
      return null;
  }
}

/**
 * Brain action -> plan, pure. `amountIn` and `minOut` were resolved by the caller (resolveAmount, then a router quote
 * and minOutFor); approvals size themselves. The recipient is the Safe unless the brain named another address, which
 * Shield 1 must then refuse. Nothing here decides whether the plan is allowed: the shields do.
 */
export function toHijackPlan(action: AgentAction, ctx: HijackContext, sized: { amountIn: bigint; minOut: bigint }): HijackPlan {
  const addr = (t: AgentToken) => ctx.tokens[t].address;
  switch (action.type) {
    case 'swap':
      return {
        mode: 'shield1',
        intent: {
          tokenIn: addr(action.tokenIn),
          tokenOut: addr(action.tokenOut),
          amountIn: sized.amountIn,
          minAmountOut: sized.minOut,
          recipient: action.recipient === 'vault' ? ctx.safe : action.recipient,
          origin: 'redteam',
        },
      };
    case 'direct':
      return {
        mode: 'onchain',
        call: 'guarded-swap-direct',
        tokenIn: addr(action.tokenIn),
        tokenOut: addr(action.tokenOut),
        amountIn: sized.amountIn,
        minOut: sized.minOut,
      };
    case 'approve':
      return {
        mode: 'onchain',
        call: 'approve-via-safe',
        token: addr(action.token),
        spender: action.spender,
        amount: action.amount === 'unlimited' ? MAX_UINT256 : toBaseUnits(action.amount, ctx.tokens[action.token].decimals),
      };
    case 'none':
      return { mode: 'none' };
  }
}
