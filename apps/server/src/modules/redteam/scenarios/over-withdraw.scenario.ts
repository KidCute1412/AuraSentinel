import { requireAddresses, type AttackScenario } from './scenario.interface';

/** Swap far above maxPerTx: must be blocked by precheck and by the on-chain cap. */
export const overWithdraw: AttackScenario = {
  name: 'over-withdraw',
  async run(ctx) {
    const { safe, tokenA, tokenB } = requireAddresses(ctx.env);
    const jobId = await ctx.enqueueSwap('attack:over-withdraw', {
      tokenIn: tokenA,
      tokenOut: tokenB,
      amountIn: 2_000n * 10n ** 6n,
      minAmountOut: 0n,
      recipient: safe,
      origin: 'redteam',
    });
    return { jobId };
  },
};
