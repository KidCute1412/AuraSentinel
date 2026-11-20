import type { AgentAction, AgentFlag } from '../schemas/agent';

/** Resolved numbers for the action's tokenIn, in base units, when known (server: from the chain; web mock: its state). */
export interface FlagContext {
  amountIn?: bigint;
  maxPerTx?: bigint;
  /** The vault's balance of tokenIn. */
  balance?: bigint;
}

/** Slippage at or above this reads as "any price" (minOut close to zero). */
export const ANY_SLIPPAGE_PCT = 50;

/**
 * What is dangerous about an action, computed by code so the UI can point at it. Display only: no shield reads these,
 * every shield re-checks the intent on its own.
 */
export function agentFlags(action: AgentAction, ctx: FlagContext = {}): AgentFlag[] {
  const out: AgentFlag[] = [];
  const size = (amount: string) => {
    if (amount === 'all' || (ctx.amountIn !== undefined && ctx.balance !== undefined && ctx.balance > 0n && ctx.amountIn >= ctx.balance)) out.push('drains-vault');
    if (ctx.amountIn !== undefined && ctx.maxPerTx !== undefined && ctx.amountIn > ctx.maxPerTx) out.push('over-cap');
  };
  switch (action.type) {
    case 'swap':
      if (action.recipient !== 'vault') out.push('recipient-not-vault');
      size(action.amount);
      if (action.maxSlippagePct >= ANY_SLIPPAGE_PCT) out.push('any-slippage');
      break;
    case 'direct':
      out.push('skips-auditor');
      size(action.amount);
      break;
    case 'approve':
      out.push('approve-stranger');
      if (action.amount === 'unlimited') out.push('unlimited-approval');
      break;
    case 'none':
      break;
  }
  return out;
}
