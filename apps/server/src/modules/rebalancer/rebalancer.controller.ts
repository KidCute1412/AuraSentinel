import { Address, CreateJobRequest, problem, type CreateJobResponse } from '@agentshield/shared';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import type { SwapIntent } from '../../core/types';
import { SwapQueueService } from '../auditor/swap-queue.service';
import { PolicyService } from '../policy/policy.service';
import { VaultRegistryService } from '../vault/vault-registry.service';
import { manualAmount, minOutFromQuote } from './domain/manual-rebalance';
import { RouterQuoteService } from './router-quote.service';
import { WriteGuard } from '../write-guard/write.guard';

const chainDown = (detail: string) =>
  new ServiceUnavailableException(problem('CHAIN_UNAVAILABLE', 'Chain unavailable', detail));

/**
 * POST /vaults/{safe}/jobs (api.md #10): a manual rebalance. API side only: build the intent from
 * chain state and queue it; the Auditor in the worker decides. The client suggests `amountIn`,
 * nothing else: tokens, minOut and recipient (always the Safe) are fixed here.
 */
@Controller('vaults/:safe/jobs')
export class RebalancerController {
  constructor(
    private readonly vaults: VaultRegistryService,
    private readonly policy: PolicyService,
    private readonly quotes: RouterQuoteService,
    private readonly swapQueue: SwapQueueService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post()
  @UseGuards(WriteGuard)
  @HttpCode(202)
  async create(
    @Param('safe') rawSafe: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateJobResponse> {
    const safe = Address.safeParse(rawSafe);
    if (!safe.success) throw new BadRequestException(problem('VALIDATION_ERROR', 'Invalid vault address', rawSafe));
    const req = CreateJobRequest.safeParse(body);
    if (!req.success) {
      const details = req.error.issues.map((i) => ({ path: i.path.join('.') || 'body', message: i.message }));
      throw new BadRequestException(problem('VALIDATION_ERROR', 'Invalid job request', undefined, { details }));
    }

    const vault = await this.vaults.resolve(safe.data).catch(() => {
      throw chainDown('Could not look up the vault');
    });
    if (!vault) throw new NotFoundException(problem('VAULT_NOT_FOUND', 'Vault not found', safe.data));
    // Access (demo vault open, others owner-only), throttle and gas are enforced by WriteGuard.

    // Single token pair until the registry serves tokens per vault (A3): sell USDC for WAVAX.
    const { TOKEN_A_ADDRESS: tokenIn, TOKEN_B_ADDRESS: tokenOut } = this.env;
    if (!tokenIn || !tokenOut) throw chainDown('TOKEN_A_ADDRESS and TOKEN_B_ADDRESS are not configured');

    if (await this.swapQueue.hasPending(vault.safe)) {
      throw new ConflictException(problem('QUEUE_BUSY', 'A swap is already running for this vault', vault.safe));
    }

    const state = await this.policy.readVaultState(vault.module).catch(() => {
      throw chainDown('Could not read the policy');
    });
    const limit = state.limits.find((l) => l.token.toLowerCase() === tokenIn.toLowerCase());
    const spent = state.spentToday.find((s) => s.token.toLowerCase() === tokenIn.toLowerCase())?.amount ?? 0n;
    const amountIn = manualAmount(BigInt(req.data.amountIn), {
      maxPerTx: limit?.maxPerTx ?? 0n,
      dailyCap: limit?.dailyCap ?? 0n,
      spentToday: spent,
    });
    const quoted = await this.quotes.amountOut(state.policy.router, tokenIn, tokenOut, amountIn).catch(() => {
      throw chainDown('Could not get a router quote');
    });

    const intent: SwapIntent = {
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut: minOutFromQuote(quoted),
      recipient: vault.safe,
      origin: 'manual',
    };
    const jobId = await this.swapQueue.enqueue(vault.safe, 'rebalance', intent);
    res.setHeader('Location', `/api/v1/jobs/${jobId}`);
    return { jobId, status: 'queued' };
  }
}
