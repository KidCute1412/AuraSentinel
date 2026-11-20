import type { FixedAttackScenario } from '@agentshield/shared';
import { bypass } from './bypass.scenario';
import { overWithdraw } from './over-withdraw.scenario';
import type { AttackContext, AttackPlan, AttackScenarioDef } from './scenario.interface';
import { unlimitedApproval } from './unlimited-approval.scenario';
import { wrongRecipient } from './wrong-recipient.scenario';

/** Every fixed scenario of the shared enum must be here (compile error otherwise). */
export const SCENARIOS: Record<FixedAttackScenario, AttackScenarioDef> = {
  'over-withdraw': overWithdraw,
  'wrong-recipient': wrongRecipient,
  'unlimited-approval': unlimitedApproval,
  bypass,
};

/** Pure: a fixed scenario plus the vault context gives the plan. No I/O, no keys. */
export function planAttack(scenario: FixedAttackScenario, ctx: AttackContext): AttackPlan {
  return SCENARIOS[scenario].plan(ctx);
}

export * from './scenario.interface';
