import { overWithdraw } from './over-withdraw.scenario';
import type { AttackScenario } from './scenario.interface';
import { wrongRecipient } from './wrong-recipient.scenario';

// TODO(AIE): unlimited-approval, bypass, prompt-injection scenarios (skill redteam-scenarios).
export const SCENARIOS: Record<string, AttackScenario> = Object.fromEntries(
  [overWithdraw, wrongRecipient].map((s) => [s.name, s]),
);
