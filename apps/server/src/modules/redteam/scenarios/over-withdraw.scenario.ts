import { ANY_MIN_OUT, OVER_CAP_AMOUNT, type AttackScenarioDef } from './scenario.interface';

/**
 * #1 Over-withdraw: 2,000 USDC through the normal pipeline.
 * Stopped by Shield 1 precheck (ExceedsPerTxCap); Shield 2 would revert with the same error.
 */
export const overWithdraw: AttackScenarioDef = {
  id: 'over-withdraw',
  plan: ({ safe, usdc, wavax }) => ({
    mode: 'shield1',
    intent: {
      tokenIn: usdc,
      tokenOut: wavax,
      amountIn: OVER_CAP_AMOUNT,
      minAmountOut: ANY_MIN_OUT,
      recipient: safe,
      origin: 'redteam',
    },
  }),
};
