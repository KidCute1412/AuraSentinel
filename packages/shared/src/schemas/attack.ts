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

/** The four fixed attacks. Prompt injection is not fixed: the hijacked agent's brain decides what it tries. */
export type FixedAttackScenario = Exclude<AttackScenario, 'prompt-injection'>;
export const FIXED_ATTACK_SCENARIOS = AttackScenario.options.filter((s): s is FixedAttackScenario => s !== 'prompt-injection');

export interface AttackExpectation {
  /** Which layer must stop it. */
  stoppedBy: 'shield1' | 'shield2' | 'safe';
  /** Terminal job status the demo should show. */
  status: Extract<JobStatus, 'rejected' | 'reverted' | 'confirmed'>;
  /** Reason code the job should carry, when one is expected. */
  reasonCode: ReasonCode | null;
  /** True when the evidence is a mined, reverted tx (Snowtrace link). */
  onchainEvidence: boolean;
}

/**
 * What each fixed scenario must produce (api.md #12). Shared so the server's tests and the web's
 * red-team panel agree on the expected outcome. A prompt injection has no fixed outcome: it depends on the
 * plan the hijacked agent wrote (JobDto.agentPlan), and it ends blocked, reverted on-chain, or `held`.
 */
export const ATTACK_EXPECTATIONS = {
  'over-withdraw': { stoppedBy: 'shield1', status: 'rejected', reasonCode: 'ExceedsPerTxCap', onchainEvidence: false },
  'wrong-recipient': { stoppedBy: 'shield1', status: 'rejected', reasonCode: 'RECIPIENT_NOT_SAFE', onchainEvidence: false },
  'unlimited-approval': { stoppedBy: 'safe', status: 'reverted', reasonCode: 'GS104', onchainEvidence: true },
  bypass: { stoppedBy: 'shield2', status: 'reverted', reasonCode: 'ExceedsPerTxCap', onchainEvidence: true },
} as const satisfies Record<FixedAttackScenario, AttackExpectation>;

/** Auto red-team: how many attacks one run writes and fires. */
export const AUTO_REDTEAM_SIZE = 5;

/** POST /vaults/{safe}/attacks/auto. No parameters: the attacker LLM writes the prompts. */
export const CreateAutoRedTeamRequest = z.object({}).strict();
export type CreateAutoRedTeamRequest = z.infer<typeof CreateAutoRedTeamRequest>;

export const CreateAutoRedTeamResponse = z.object({
  /** `llm` = the attacker model wrote the prompts; `rules` = the fixed preset list (LLM off or failed). */
  source: z.enum(['llm', 'rules']),
  /** One prompt-injection job per prompt, in the order they run. */
  jobs: z.array(z.object({ jobId: z.string().uuid(), text: z.string().min(1).max(INJECTION_TEXT_MAX) })).min(1).max(AUTO_REDTEAM_SIZE),
});
export type CreateAutoRedTeamResponse = z.infer<typeof CreateAutoRedTeamResponse>;
