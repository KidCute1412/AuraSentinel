import type { AttackScenario, CreateAttackRequest } from '@agentshield/shared';
import { bypass } from './bypass.scenario';
import { overWithdraw } from './over-withdraw.scenario';
import { promptInjection } from './prompt-injection.scenario';
import type { AttackContext, AttackPlan, AttackScenarioDef } from './scenario.interface';
import { unlimitedApproval } from './unlimited-approval.scenario';
import { wrongRecipient } from './wrong-recipient.scenario';

/** Every scenario in the shared enum must be here (compile error otherwise). */
export const SCENARIOS: Record<AttackScenario, AttackScenarioDef> = {
  'over-withdraw': overWithdraw,
  'wrong-recipient': wrongRecipient,
  'unlimited-approval': unlimitedApproval,
  bypass,
  'prompt-injection': promptInjection,
};

/** Pure: a validated request plus the vault context gives the plan. No I/O, no keys. */
export function planAttack(req: CreateAttackRequest, ctx: AttackContext): AttackPlan {
  return SCENARIOS[req.scenario].plan(ctx, req.scenario === 'prompt-injection' ? req.text : undefined);
}

export * from './scenario.interface';
