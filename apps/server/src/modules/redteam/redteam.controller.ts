import { Address, CreateAttackRequest, problem, type CreateAttackResponse } from '@agentshield/shared';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { QUEUES } from '../../core/queue/queue.constants';
import { SwapQueueService } from '../auditor/swap-queue.service';
import { JobsService } from '../jobs/jobs.service';
import { AttackConfigError, attackContext, planAttack } from './scenarios';

/** Data on the `attack` queue: on-chain attacks only (#3, #4). */
export interface AttackJobData {
  jobId: string;
  vault: `0x${string}`;
  scenario: 'unlimited-approval' | 'bypass';
}

/**
 * POST /vaults/{safe}/attacks (api.md #12). The client only picks the scenario; amounts and
 * recipients are fixed in the scenario files. Shield 1 attacks go through the normal swap queue
 * so the Auditor must stop them; on-chain attacks go to the attack queue for the worker.
 * TODO(A9): problem+json filter, throttle + cooldown for the demo vault.
 */
@Controller('vaults/:safe/attacks')
export class RedteamController {
  constructor(
    @InjectQueue(QUEUES.attack) private readonly attacks: Queue<AttackJobData>,
    private readonly swapQueue: SwapQueueService,
    private readonly jobs: JobsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post()
  @HttpCode(202)
  async launch(
    @Param('safe') rawSafe: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateAttackResponse> {
    const safe = Address.safeParse(rawSafe);
    if (!safe.success) {
      throw new BadRequestException(problem('VALIDATION_ERROR', 'Địa chỉ vault không hợp lệ', rawSafe));
    }
    const req = CreateAttackRequest.safeParse(body);
    if (!req.success) {
      const details = req.error.issues.map((i) => ({ path: i.path.join('.') || 'body', message: i.message }));
      throw new BadRequestException(
        problem('VALIDATION_ERROR', 'Yêu cầu tấn công không hợp lệ', 'Kiểm tra scenario và text', { details }),
      );
    }

    let plan;
    try {
      plan = planAttack(req.data, attackContext(this.env, safe.data));
    } catch (err) {
      if (err instanceof AttackConfigError) {
        throw new ServiceUnavailableException(problem('CHAIN_UNAVAILABLE', 'Vault chưa được cấu hình', err.message));
      }
      throw err;
    }

    const kind = `attack:${req.data.scenario}`;
    let jobId: string;
    if (plan.mode === 'shield1') {
      jobId = await this.swapQueue.enqueue(safe.data, kind, plan.intent, { untrustedText: plan.untrustedText });
    } else {
      const scenario = req.data.scenario as AttackJobData['scenario'];
      const row = await this.jobs.create(safe.data, kind);
      jobId = row.id;
      await this.attacks.add(scenario, { jobId, vault: safe.data, scenario }, { jobId });
    }

    res.setHeader('Location', `/api/v1/jobs/${jobId}`);
    return { jobId, scenario: req.data.scenario, status: 'queued' };
  }
}
