import { ATTACKER, type AttackScenarioDef } from './scenario.interface';

const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * #3 Unlimited approval: the session key asks the Safe to run USDC.approve(spender, MAX) via
 * execTransactionFromModule. Stopped by the Safe itself (GS104): the agent EOA is not an enabled
 * module, only AgentPolicyModule is. The spec text says approve(router, MAX); the spender does
 * not change the outcome, and the attacker address makes the intent obvious on Snowtrace.
 */
export const unlimitedApproval: AttackScenarioDef = {
  id: 'unlimited-approval',
  plan: ({ usdc }) => ({ mode: 'onchain', call: 'approve-via-safe', token: usdc, spender: ATTACKER, amount: MAX_UINT256 }),
};
