import {
  Address,
  CreateAttackRequest,
  CreateAutoRedTeamRequest,
  problem,
  type CreateAttackResponse,
  type CreateAutoRedTeamResponse,
} from '@agentshield/shared';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { QUEUES } from '../../core/queue/queue.constants';
import { RateLimiter } from '../../core/redis/rate-limiter';
import { BrainService } from '../agent-brain/brain.service';
import { SwapQueueService } from '../auditor/swap-queue.service';
import { JobsService } from '../jobs/jobs.service';
import { AttackConfigError, attackContext, planAttack } from './scenarios';
import { WriteGuard } from '../write-guard/write.guard';

/**
 * Data on the `attack` queue: the on-chain attacks (#3, #4) and every Hijacked Agent run, whose brain plans in the
 * worker (an LLM call has no place in the HTTP request).
 */
export type AttackJobData =
  | { jobId: string; vault: `0x${string}`; scenario: 'unlimited-approval' | 'bypass' }
  | { jobId: string; vault: `0x${string}`; scenario: 'prompt-injection'; text: string };

export const HIJACK_KIND = 'attack:prompt-injection';

/**
 * POST /vaults/{safe}/attacks (api.md #12) and POST /vaults/{safe}/attacks/auto (#12b).
 * - Fixed attacks: the client only picks the scenario; amounts and recipients are fixed in the scenario files. Shield 1
 *   attacks go through the normal swap queue as dryRun jobs (judged by every shield, never signed); on-chain attacks
 *   go to the attack queue for the worker.
 * - Prompt injection (Hijacked Agent): the visitor's text goes to the worker, where the agent's brain turns it into a
 *   plan and the shields judge that plan.
 */
@Controller('vaults/:safe/attacks')
export class RedteamController {
  constructor(
    @InjectQueue(QUEUES.attack) private readonly attacks: Queue<AttackJobData>,
    private readonly swapQueue: SwapQueueService,
    private readonly jobs: JobsService,
    @Inject(ENV) private readonly env: Env,
    private readonly brain: BrainService,
    private readonly limiter: RateLimiter,
  ) {}

  @Post()
  @UseGuards(WriteGuard)
  @HttpCode(202)
  async launch(
    @Param('safe') rawSafe: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateAttackResponse> {
    const safe = this.parseSafe(rawSafe);
    const req = CreateAttackRequest.safeParse(body);
    if (!req.success) {
      const details = req.error.issues.map((i) => ({ path: i.path.join('.') || 'body', message: i.message }));
      throw new BadRequestException(
        problem('VALIDATION_ERROR', 'Yêu cầu tấn công không hợp lệ', 'Kiểm tra scenario và text', { details }),
      );
    }
    const ctx = this.context(safe);

    let jobId: string;
    if (req.data.scenario === 'prompt-injection') {
      jobId = await this.queueHijack(safe, req.data.text);
    } else {
      const plan = planAttack(req.data.scenario, ctx);
      const kind = `attack:${req.data.scenario}`;
      if (plan.mode === 'shield1') {
        // dryRun: an attack is judged, never signed, even if a looser policy would let it through.
        jobId = await this.swapQueue.enqueue(safe, kind, plan.intent, { dryRun: true });
      } else {
        const scenario = req.data.scenario as 'unlimited-approval' | 'bypass';
        const row = await this.jobs.create(safe, kind);
        jobId = row.id;
        await this.attacks.add(scenario, { jobId, vault: safe, scenario }, { jobId });
      }
    }

    res.setHeader('Location', `/api/v1/jobs/${jobId}`);
    return { jobId, scenario: req.data.scenario, status: 'queued' };
  }

  /**
   * Auto red-team: an attacker model writes AUTO_REDTEAM_SIZE poisoned feed items, and each one becomes a Hijacked
   * Agent run, queued in order. One run per vault per AUTO_REDTEAM_COOLDOWN_MS (they cost LLM calls).
   */
  @Post('auto')
  @UseGuards(WriteGuard)
  @HttpCode(202)
  async auto(
    @Param('safe') rawSafe: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateAutoRedTeamResponse> {
    const safe = this.parseSafe(rawSafe);
    if (!CreateAutoRedTeamRequest.safeParse(body ?? {}).success) {
      throw new BadRequestException(problem('VALIDATION_ERROR', 'Yêu cầu không hợp lệ', 'Auto red-team takes no parameters'));
    }
    this.context(safe);

    const ms = this.env.AUTO_REDTEAM_COOLDOWN_MS;
    if (ms > 0) {
      const r = await this.limiter.cooldown(`auto-redteam:${safe.toLowerCase()}`, ms);
      if (!r.ok) {
        const seconds = Math.max(1, Math.ceil(r.retryAfterMs / 1000));
        res.setHeader('Retry-After', String(seconds));
        throw new HttpException(problem('COOLDOWN', 'One auto red-team run at a time', `Retry in ${seconds} s`), HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const { source, texts } = await this.brain.writeAttacks();
    const jobs: CreateAutoRedTeamResponse['jobs'] = [];
    for (const text of texts) jobs.push({ jobId: await this.queueHijack(safe, text), text });
    return { source, jobs };
  }

  /** Job row first (the page shows "the agent is reading the feed"), then the worker plans and runs it. */
  private async queueHijack(safe: `0x${string}`, text: string): Promise<string> {
    const row = await this.jobs.create(safe, HIJACK_KIND);
    await this.attacks.add('prompt-injection', { jobId: row.id, vault: safe, scenario: 'prompt-injection', text }, { jobId: row.id });
    return row.id;
  }

  private parseSafe(rawSafe: string): `0x${string}` {
    const safe = Address.safeParse(rawSafe);
    if (!safe.success) throw new BadRequestException(problem('VALIDATION_ERROR', 'Địa chỉ vault không hợp lệ', rawSafe));
    return safe.data;
  }

  private context(safe: `0x${string}`) {
    try {
      return attackContext(this.env, safe);
    } catch (err) {
      if (err instanceof AttackConfigError) {
        throw new ServiceUnavailableException(problem('CHAIN_UNAVAILABLE', 'Vault chưa được cấu hình', err.message));
      }
      throw err;
    }
  }
}
