import { Inject, Injectable } from '@nestjs/common';
import type { SwapIntent } from '../../core/types';
import { ExplainerService } from '../explainer/explainer.service';
import { TX_SENDER, type TxSenderPort } from '../execution/tx-sender.port';
import { JobsService } from '../jobs/jobs.service';
import { SIMULATOR, type SimulatorPort } from '../simulation/simulator.port';

/**
 * Shield 1 state machine: precheck -> simulate -> invariants -> send || explain.
 * Verdict is deterministic; the LLM only writes messageVi (invariant 3).
 * TODO(AIE/FS2): inject PolicyService and run domain/precheck.ts before simulating, post-sim invariants, send+explain in parallel.
 */
@Injectable()
export class AuditorService {
  constructor(
    private readonly jobs: JobsService,
    private readonly explainer: ExplainerService,
    @Inject(SIMULATOR) private readonly simulator: SimulatorPort,
    @Inject(TX_SENDER) private readonly sender: TxSenderPort,
  ) {}

  async audit(jobId: string, intent: SwapIntent): Promise<void> {
    await this.jobs.transition(jobId, 'simulating');
    const sim = await this.simulator.simulate(intent);
    if (!sim.ok) {
      const explanation = await this.explainer.explain({ verdict: 'blocked', reasonCode: sim.revertReason, intent, sim });
      await this.jobs.transition(jobId, 'blocked', { reasonCode: sim.revertReason, explanation });
      return;
    }
    await this.jobs.transition(jobId, 'sending');
    const txHash = await this.sender.sendSwap(intent);
    const explanation = await this.explainer.explain({ verdict: 'approved', intent, sim });
    await this.jobs.transition(jobId, 'confirmed', { txHash, explanation });
  }
}
