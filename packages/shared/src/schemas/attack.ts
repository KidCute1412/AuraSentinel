import { z } from 'zod';
import type { ReasonCode } from '../errors';
import { JobStatus } from './job';

/** The 4 red-team attacks plus the prompt-injection box (api.md #12, system-design §5). */
export const AttackScenario = z.enum([
  'over-withdraw',
  'wrong-recipient',
  'unlimited-approval',
  'bypass',
  'prompt-injection',
]);
export type AttackScenario = z.infer<typeof AttackScenario>;

/** Max visitor text for the injection box; same cap the explainer applies. */
export const INJECTION_TEXT_MAX = 500;

const plain = (scenario: Exclude<AttackScenario, 'prompt-injection'>) =>
  z.object({ scenario: z.literal(scenario) }).strict();

/**
 * POST /vaults/{safe}/attacks. Every attack parameter (amount, recipient, gas) is fixed on the
 * server; the client only picks the scenario. `text` is required for prompt-injection and
 * rejected everywhere else (strict objects), so a 400 is raised for missing or extra text.
 */
export const CreateAttackRequest = z.discriminatedUnion('scenario', [
  plain('over-withdraw'),
  plain('wrong-recipient'),
  plain('unlimited-approval'),
  plain('bypass'),
  z
    .object({
      scenario: z.literal('prompt-injection'),
      text: z.string().trim().min(1).max(INJECTION_TEXT_MAX),
    })
    .strict(),
]);
export type CreateAttackRequest = z.infer<typeof CreateAttackRequest>;

export const CreateAttackResponse = z.object({
  jobId: z.string().uuid(),
  scenario: AttackScenario,
  status: JobStatus,
});
export type CreateAttackResponse = z.infer<typeof CreateAttackResponse>;

export interface AttackExpectation {
  /** Which layer must stop it. */
  stoppedBy: 'shield1' | 'shield2' | 'safe' | 'llm-guard';
  /** Terminal job status the demo should show. */
  status: Extract<JobStatus, 'rejected' | 'reverted' | 'confirmed'>;
  /** Reason code the job should carry, when one is expected. */
  reasonCode: ReasonCode | null;
  /** True when the evidence is a mined, reverted tx (Snowtrace link). */
  onchainEvidence: boolean;
}

/**
 * What each scenario must produce (api.md #12). Shared so the server's tests and the web's
 * red-team panel agree on the expected outcome.
 */
export const ATTACK_EXPECTATIONS = {
  'over-withdraw': { stoppedBy: 'shield1', status: 'rejected', reasonCode: 'ExceedsPerTxCap', onchainEvidence: false },
  'wrong-recipient': { stoppedBy: 'shield1', status: 'rejected', reasonCode: 'RECIPIENT_NOT_SAFE', onchainEvidence: false },
  'unlimited-approval': { stoppedBy: 'safe', status: 'reverted', reasonCode: 'GS104', onchainEvidence: true },
  bypass: { stoppedBy: 'shield2', status: 'reverted', reasonCode: 'ExceedsPerTxCap', onchainEvidence: true },
  // The swap itself is a normal, valid one; the attack targets the explanation only (P3).
  'prompt-injection': { stoppedBy: 'llm-guard', status: 'confirmed', reasonCode: null, onchainEvidence: false },
} as const satisfies Record<AttackScenario, AttackExpectation>;
