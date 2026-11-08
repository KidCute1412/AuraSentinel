import { ANY_MIN_OUT, ATTACKER, SMALL_AMOUNT, type AttackScenarioDef } from './scenario.interface';

/**
 * #2 Wrong recipient: a small, in-budget swap whose output goes to the attacker.
 * Stopped by Shield 1 (RECIPIENT_NOT_SAFE). On chain the module has no recipient parameter at
 * all: the router always pays the Safe, so there is no field to abuse.
 */
export const wrongRecipient: AttackScenarioDef = {
  id: 'wrong-recipient',
  plan: ({ usdc, wavax }) => ({
    mode: 'shield1',
    intent: {
      tokenIn: usdc,
      tokenOut: wavax,
      amountIn: SMALL_AMOUNT,
      minAmountOut: ANY_MIN_OUT,
      recipient: ATTACKER,
      origin: 'redteam',
    },
  }),
};
