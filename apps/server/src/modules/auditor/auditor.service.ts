import { Inject, Injectable } from '@nestjs/common';
import { zeroAddress } from 'viem';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import type { SwapIntent, VaultTarget } from '../../core/types';
import { ExplainerService } from '../explainer/explainer.service';
import { TX_SENDER, type TxSenderPort } from '../execution/tx-sender.port';
import { JobsService } from '../jobs/jobs.service';
import { SIMULATOR, type SimulatorPort } from '../simulation/simulator.port';

/**
 * Shield 1 state machine: precheck -> simulate -> invariants -> send || explain.
 * Verdict is deterministic; the LLM only writes messageVi (invariant 3).
 * TODO(A6): per-vault target from the registry, precheck before simulating, post-sim
 * invariants, send+explain in parallel.
 */
@Injectable()
export class AuditorService {
  constructor(
    private readonly jobs: JobsService,
    private readonly explainer: ExplainerService,
    @Inject(SIMULATOR) private readonly simulator: SimulatorPort,
    @Inject(TX_SENDER) private readonly sender: TxSenderPort,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Single demo vault from env until A3/A6 resolve it per job. Never from intent.recipient. */
  private target(): VaultTarget {
    return { safe: this.env.SAFE_ADDRESS ?? zeroAddress, module: this.env.POLICY_MODULE_ADDRESS ?? zeroAddress };
  }

  async audit(jobId: string, intent: SwapIntent): Promise<void> {
    const target = this.target();
    await this.jobs.transition(jobId, 'simulating');
    const sim = await this.simulator.simulate(intent, { ...target, agent: this.sender.address });
    if (!sim.ok) {
      const explanation = await this.explainer.explain({ verdict: 'blocked', reasonCode: sim.revertReason, intent, sim });
      await this.jobs.transition(jobId, 'rejected', { reasonCode: sim.revertReason, simResult: sim, explanation });
      return;
    }
    await this.jobs.transition(jobId, 'broadcasting', { simResult: sim });
    const tx = await this.sender.sendSwap(intent, target);
    if (tx.status === 'success') this.simulator.invalidate?.(); // spentInDay moved on Fuji
    if (tx.status === 'reverted') {
      // Shield 2 stopped what Shield 1 let through (e.g. Kill-Switch between sim and send).
      const explanation = await this.explainer.explain({ verdict: 'blocked', reasonCode: tx.revertReason, intent, sim });
      await this.jobs.transition(jobId, 'reverted', { txHash: tx.txHash, reasonCode: tx.revertReason, explanation });
      return;
    }
    const explanation = await this.explainer.explain({ verdict: 'approved', intent, sim });
    await this.jobs.transition(jobId, 'confirmed', { txHash: tx.txHash, explanation });
  }
}
