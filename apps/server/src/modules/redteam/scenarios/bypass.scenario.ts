import { ANY_MIN_OUT, OVER_CAP_AMOUNT, type AttackScenarioDef } from './scenario.interface';

/**
 * #4 Bypass the website: the session key calls executeGuardedSwap(2,000 USDC) straight on Fuji,
 * skipping Shield 1 entirely. Stopped by Shield 2 (ExceedsPerTxCap). Sent with manual gas so the
 * revert is mined and the judges get a Snowtrace link (system-design §5).
 */
export const bypass: AttackScenarioDef = {
  id: 'bypass',
  plan: ({ usdc, wavax }) => ({
    mode: 'onchain',
    call: 'guarded-swap-direct',
    tokenIn: usdc,
    tokenOut: wavax,
    amountIn: OVER_CAP_AMOUNT,
    minOut: ANY_MIN_OUT,
  }),
};
