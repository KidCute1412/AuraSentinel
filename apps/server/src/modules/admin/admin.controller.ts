import { UpdateRebalancerRequest, problem, type RebalancerStatusDto } from '@agentshield/shared';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Body, Controller, Get, Inject, Patch, UseGuards } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { getAddress, zeroAddress, type PublicClient } from 'viem';
import { POLICY_MODULE_ABI } from '../../core/chain/abis';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { QUEUES } from '../../core/queue/queue.constants';
import { AdminGuard } from '../auth/admin.guard';

/**
 * Admin drawer (api.md #15, #16, D16): Demo mode = pause the 24/7 rebalancer. Pausing the BullMQ
 * queue is stored in Redis, so it holds across the API and worker processes and survives restarts.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    @InjectQueue(QUEUES.rebalance) private readonly queue: Queue,
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('rebalancer')
  status(): Promise<RebalancerStatusDto> {
    return this.read();
  }

  /** Idempotent: setting the current value again is a no-op that returns the same resource. */
  @Patch('rebalancer')
  async update(@Body() body: unknown): Promise<RebalancerStatusDto> {
    const req = UpdateRebalancerRequest.safeParse(body);
    if (!req.success) throw new BadRequestException(problem('VALIDATION_ERROR', 'Body must be { paused: boolean }'));
    if (req.data.paused) await this.queue.pause();
    else await this.queue.resume();
    return this.read();
  }

  private async read(): Promise<RebalancerStatusDto> {
    const [paused, [last], agent] = await Promise.all([
      this.queue.isPaused(),
      this.queue.getJobs(['completed'], 0, 0, false),
      this.agent(),
    ]);
    return {
      paused,
      intervalMs: this.env.REBALANCE_INTERVAL_MS,
      lastTickAt: last?.finishedOn ? new Date(last.finishedOn).toISOString() : null,
      agent,
    };
  }

  /** The session key's public address comes from the demo vault's policy: the API holds no key. */
  private async agent(): Promise<RebalancerStatusDto['agent']> {
    const module = this.env.POLICY_MODULE_ADDRESS;
    try {
      if (!module) throw new Error('no module');
      const [address] = await this.client.readContract({ address: module, abi: POLICY_MODULE_ABI, functionName: 'policy' });
      const wei = await this.client.getBalance({ address });
      return { address: getAddress(address), avaxBalance: wei.toString(), lowGas: wei < this.env.AGENT_MIN_GAS_WEI };
    } catch {
      return { address: zeroAddress, avaxBalance: '0', lowGas: true };
    }
  }
}
