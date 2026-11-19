import { fromAmount, fromSignedAmount } from '@agentshield/shared';
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import type { Address } from 'viem';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import type { Explanation, SimResult, SwapIntent, VaultTarget } from '../../core/types';
import { TX_SENDER, type TxResult, type TxSenderPort } from '../execution/tx-sender.port';
import type { ExplainInput } from '../explainer/explainer.port';
import { ExplainerService } from '../explainer/explainer.service';
import { JobsService } from '../jobs/jobs.service';
import { PolicyService, type VaultChainState } from '../policy/policy.service';
import { SIMULATOR, type SimulatorPort } from '../simulation/simulator.port';
import { VaultRegistryService } from '../vault/vault-registry.service';
import { invariantChecks, netFlow, onchainChecks, precheckChecks, simulationChecks, type ChainMove, type TokenInfo } from './domain/checks';
import { checkInvariants, type SimOutcome } from './domain/invariants';
import { findLimit, precheck, spentFor, type PrecheckSnapshot } from './domain/precheck';
import { tokenInfoFor } from './domain/tokens';
import { bpsToPct, budgetUsedBps, decideVerdict, type SimStep } from './domain/verdict';

export interface AuditRequest {
  jobId: string;
  vault: Address;
  intent: SwapIntent;
  /** Red-team injection text: explainer prompt data only, never a decision input. */
  untrustedText?: string;
  /** BullMQ will not retry after this attempt: an infra error now ends the job as `failed`. */
  lastAttempt: boolean;
}

/** Per-job context the explainer needs, all deterministic and read from the chain. */
interface Facts {
  state: VaultChainState;
  target: VaultTarget;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Shield 1 state machine (auditor-pipeline skill, A6):
 *
 *   queued -> prechecking -> (rejected | simulating) -> (rejected | broadcasting)
 *          -> (confirmed | reverted | failed)
 *
 * precheck (live chain state) -> Anvil sim -> post-sim invariants -> deterministic verdict ->
 * broadcast || explain. The verdict, amounts and the decision to sign never depend on the LLM
 * (P3); the explanation is generated beside the broadcast and attached when ready, so a slow
 * explainer can never delay a swap.
 *
 * Retries: only infra errors before broadcast throw a plain Error (BullMQ retries, attempts 3).
 * Verdicts are data, never errors. Anything that goes wrong at or after broadcast is final
 * (UnrecoverableError + `failed`), so a swap is never sent twice.
 */
@Injectable()
export class AuditorService implements OnModuleDestroy {
  private readonly log = new Logger(AuditorService.name);
  /** Explanations still being written; awaited on shutdown so none is lost mid-flight. */
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly jobs: JobsService,
    private readonly explainer: ExplainerService,
    private readonly policy: PolicyService,
    private readonly vaults: VaultRegistryService,
    @Inject(SIMULATOR) private readonly simulator: SimulatorPort,
    @Inject(TX_SENDER) private readonly sender: TxSenderPort,
    @Optional() @Inject(ENV) env?: Pick<Env, 'TOKEN_A_ADDRESS' | 'TOKEN_B_ADDRESS'>,
  ) {
    this.tokens = tokenInfoFor({ tokenA: env?.TOKEN_A_ADDRESS, tokenB: env?.TOKEN_B_ADDRESS });
  }

  /** Labels the amounts in the rule tables (display only). */
  private readonly tokens: TokenInfo;

  async onModuleDestroy() {
    await Promise.allSettled([...this.pending]);
  }

  /** Resolves when the job reached a terminal status; explanations may still be in flight. */
  async audit(req: AuditRequest): Promise<void> {
    try {
      await this.run(req);
    } catch (e) {
      const final = e instanceof UnrecoverableError || req.lastAttempt;
      this.log.error(`job ${req.jobId} ${final ? 'failed' : 'will retry'}: ${message(e)}`);
      if (final) await this.jobs.transition(req.jobId, 'failed').catch(() => undefined);
      throw e;
    }
  }

  /** Waits for every in-flight explanation (tests and shutdown). */
  async settled(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  private async run({ jobId, vault, intent, untrustedText }: AuditRequest): Promise<void> {
    await this.jobs.transition(jobId, 'prechecking');

    // The target comes from the chain-backed registry, never from intent.recipient.
    const resolved = await this.vaults.resolve(vault);
    if (!resolved) {
      await this.jobs.transition(jobId, 'failed', { reasonCode: 'VAULT_NOT_FOUND' });
      throw new UnrecoverableError(`no AgentPolicyModule for vault ${vault}`);
    }
    const target: VaultTarget = { safe: resolved.safe, module: resolved.module };

    // (a) precheck on live chain state, read at one block (P1).
    const state = await this.policy.readVaultState(target.module);
    const snapshot: PrecheckSnapshot = {
      safe: target.safe,
      signer: this.sender.address,
      now: state.now,
      policy: state.policy,
      limits: state.limits,
      spentToday: state.spentToday,
    };
    const pre = precheck(intent, snapshot);
    const facts: Facts = { state, target };
    await this.jobs.recordShield(jobId, 'precheck', pre.ok ? 'pass' : 'fail', pre.reasons[0] ?? null, precheckChecks(intent, snapshot, this.tokens));
    if (!pre.ok) {
      const verdict = decideVerdict({ precheck: pre });
      await this.jobs.transition(jobId, 'rejected', { precheck: pre, reasonCode: verdict.reasonCode });
      this.attachLater(jobId, this.explain('blocked', verdict.reasonCode, intent, facts, untrustedText));
      return;
    }

    // (b) simulation on the Anvil fork, signed (impersonated) as our session key.
    await this.jobs.transition(jobId, 'simulating', { precheck: pre });
    const sim = await this.simulator.simulate(intent, { ...target, agent: this.sender.address });
    const simStep = toSimStep(intent, sim);
    const outcome = sim.ok ? toOutcome(sim) : null;
    await this.jobs.recordShield(
      jobId,
      'simulation',
      sim.ok ? 'pass' : 'fail',
      sim.ok ? null : (sim.revertReason ?? null),
      simulationChecks(intent, outcome ? { ok: true, outcome } : { ok: false, revertReason: sim.revertReason ?? null }, this.tokens),
    );

    // (c) invariants: a sim that did not revert is not automatically safe.
    if (!simStep.reverted && outcome) {
      const inv = simStep.invariants;
      await this.jobs.recordShield(jobId, 'invariant', inv.ok ? 'pass' : 'fail', inv.reasons[0] ?? null, invariantChecks(intent, outcome, this.tokens));
    }

    const verdict = decideVerdict({ precheck: pre, sim: simStep });
    if (verdict.verdict === 'blocked') {
      await this.jobs.transition(jobId, 'rejected', { simResult: sim, reasonCode: verdict.reasonCode });
      this.attachLater(jobId, this.explain('blocked', verdict.reasonCode, intent, facts, untrustedText, sim));
      return;
    }

    // Verdict safe: broadcast || explain. The explanation starts now but is attached only once
    // the receipt says what really happened, so a Shield 2 revert never shows "safe".
    await this.jobs.transition(jobId, 'broadcasting', { simResult: sim });
    const approved = this.explain('approved', null, intent, facts, untrustedText, sim);
    this.track(approved);

    let tx: TxResult;
    try {
      tx = await this.sender.sendSwap(intent, target);
    } catch (e) {
      // Maybe broadcast, maybe not: never retry, the agent could pay twice.
      await this.jobs.transition(jobId, 'failed', { reasonCode: 'BROADCAST_FAILED' });
      throw new UnrecoverableError(`broadcast failed: ${message(e)}`);
    }

    this.simulator.invalidate?.(); // spentInDay / balances moved (or a revert burned a nonce)
    if (tx.status === 'reverted') {
      // Shield 2 stopped what Shield 1 let through (e.g. Kill-Switch between sim and send).
      const reason = tx.revertReason ?? 'UNKNOWN_REVERT';
      await this.jobs.recordShield(jobId, 'onchain', 'fail', reason, onchainChecks({ ...tx, revertReason: reason }));
      await this.jobs.transition(jobId, 'reverted', { txHash: tx.txHash, reasonCode: reason });
      this.attachLater(jobId, this.explain('blocked', reason, intent, facts, untrustedText, sim));
      return;
    }
    await this.jobs.recordShield(jobId, 'onchain', 'pass', null, onchainChecks(tx, await this.chainMoves(intent, target.safe, tx), this.tokens));
    await this.jobs.transition(jobId, 'confirmed', { txHash: tx.txHash });
    this.attachLater(jobId, approved);
  }

  /**
   * What the mined swap measurably did to the Safe (tokenIn, tokenOut): net flow from the receipt's Transfer logs and
   * the balance at that block. Display evidence only, never a decision input. Never throws: a failed balance read
   * leaves balanceAfter null.
   */
  private async chainMoves(intent: SwapIntent, safe: Address, tx: TxResult): Promise<ChainMove[]> {
    const tokens = [intent.tokenIn, intent.tokenOut] as const;
    const after = await this.policy.balancesAt(safe, tokens, tx.blockNumber).catch((e: unknown) => {
      this.log.warn(`balances after ${tx.txHash}: ${message(e)}`);
      return null;
    });
    return tokens.map((token, i) => ({ token, delta: netFlow(tx.transfers ?? [], safe, token), balanceAfter: after?.[i] ?? null }));
  }

  /** Builds the explainer input from deterministic facts and asks for messageVi. Never throws. */
  private async explain(
    verdict: ExplainInput['verdict'],
    reasonCode: string | null,
    intent: SwapIntent,
    { state }: Facts,
    untrustedText?: string,
    sim?: SimResult,
  ): Promise<Explanation> {
    const limit = findLimit(state.limits, intent.tokenIn);
    const spentToday = spentFor(state.spentToday, intent.tokenIn);
    const bps = budgetUsedBps({
      verdict: verdict === 'approved' ? 'safe' : 'blocked',
      spentToday,
      amountIn: intent.amountIn,
      dailyCap: limit?.dailyCap ?? 0n,
    });
    const tokens = await Promise.all([this.policy.tokenMeta(intent.tokenIn), this.policy.tokenMeta(intent.tokenOut)]).then(
      ([tin, tout]) => ({ in: tin, out: tout }),
      () => undefined, // display only: without it the template uses number-free sentences
    );
    return this.explainer.explain({
      verdict,
      reasonCode,
      budgetUsedPct: bpsToPct(bps),
      intent,
      sim,
      tokens,
      limits: limit ? { maxPerTx: limit.maxPerTx, dailyCap: limit.dailyCap, spentToday } : undefined,
      expiry: state.policy.expiry,
      untrustedText,
    });
  }

  private attachLater(jobId: string, explanation: Promise<Explanation>) {
    this.track(
      explanation
        .then((e) => this.jobs.attachExplanation(jobId, e))
        .catch((e: unknown) => this.log.warn(`job ${jobId}: explanation not attached: ${message(e)}`)),
    );
  }

  private track(p: Promise<unknown>) {
    const tracked = p.catch(() => undefined).finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
  }
}

/** Simulator result -> verdict input. Amounts are base-unit strings on the wire (P5). */
function toOutcome(sim: SimResult): SimOutcome {
  return {
    deltaSafeTokenOut: fromSignedAmount(sim.deltaSafeTokenOut),
    deltaSafeTokenIn: fromSignedAmount(sim.deltaSafeTokenIn),
    deltaAttacker: fromAmount(sim.attackerBalance),
    allowanceAfter: fromAmount(sim.allowanceAfter),
  };
}

function toSimStep(intent: SwapIntent, sim: SimResult): SimStep {
  if (!sim.ok) return { reverted: true, revertReason: sim.revertReason ?? null };
  return { reverted: false, invariants: checkInvariants(intent, toOutcome(sim)) };
}

