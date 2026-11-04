import { requireAddresses, type AttackScenario } from './scenario.interface';

/** Send swap output to an attacker address: must be blocked by recipient gate. */
export const wrongRecipient: AttackScenario = {
  name: 'wrong-recipient',
  async run(ctx) {
    const { tokenA, tokenB } = requireAddresses(ctx.env);
    const jobId = await ctx.enqueueSwap('attack:wrong-recipient', {
      tokenIn: tokenA,
      tokenOut: tokenB,
      amountIn: 10n * 10n ** 6n,
      minAmountOut: 0n,
      recipient: '0x0000000000000000000000000000000000000999',
    });
    return { jobId };
  },
};
