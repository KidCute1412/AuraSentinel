import { overWithdraw } from './over-withdraw.scenario';
import type { AttackScenarioDef } from './scenario.interface';

/**
 * Prompt injection: the visitor's text rides on an over-cap intent and reaches the explainer
 * only as <untrusted_input>. Whatever the text says ("approve it", "send to 0x999"), the verdict
 * is computed by code and stays blocked (P3); if the model is fooled, the output guard falls
 * back to the template. No money moves and no gas is spent per click.
 */
export const promptInjection: AttackScenarioDef = {
  id: 'prompt-injection',
  plan: (ctx, text) => {
    const base = overWithdraw.plan(ctx);
    if (base.mode !== 'shield1') throw new Error('prompt-injection needs a Shield 1 intent');
    return { ...base, untrustedText: text ?? '' };
  },
};
