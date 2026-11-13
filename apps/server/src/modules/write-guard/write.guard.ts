import { problem } from '@agentshield/shared';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { isAddress, type Address, type PublicClient } from 'viem';
import { POLICY_MODULE_ABI } from '../../core/chain/abis';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { RateLimiter, type LimitResult } from '../../core/redis/rate-limiter';
import { VaultRegistryService } from '../vault/vault-registry.service';

/** Agent balance is cached this long: one RPC call per agent per window, not one per click. */
const GAS_CACHE_MS = 15_000;

/**
 * Abuse protection for the public write endpoints (POST /vaults/{safe}/jobs and /attacks), A9:
 * 1. per client IP: WRITE_LIMIT_PER_IP writes per WRITE_IP_WINDOW_MS     -> 429 RATE_LIMITED
 * 2. demo vault: one write from anyone per DEMO_WRITE_COOLDOWN_MS (D12),
 *    other vaults: one write per (vault, endpoint) per WRITE_COOLDOWN_MS -> 429 COOLDOWN
 * 3. agent balance below AGENT_MIN_GAS_WEI                               -> 503 AGENT_LOW_GAS
 * 429s carry Retry-After (seconds). A blocked attack stays a 202 with a red result: only abuse
 * and an empty gas tank are HTTP errors (api.md §1).
 */
@Injectable()
export class WriteGuard implements CanActivate {
  private readonly log = new Logger(WriteGuard.name);
  private readonly gas = new Map<string, { at: number; wei: bigint }>();

  constructor(
    private readonly limiter: RateLimiter,
    private readonly vaults: VaultRegistryService,
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const rawSafe = String(req.params.safe ?? '');
    const safe = rawSafe.toLowerCase();
    const endpoint = req.path.split('/').filter(Boolean).at(-1) ?? 'write';
    const e = this.env;

    if (e.WRITE_LIMIT_PER_IP > 0) {
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      this.enforce(res, await this.limiter.window(`ip:${ip}`, e.WRITE_LIMIT_PER_IP, e.WRITE_IP_WINDOW_MS), 'RATE_LIMITED', 'Too many requests from this address');
    }

    const demo = isAddress(rawSafe, { strict: false }) && this.vaults.isDemo(rawSafe);
    if (demo && e.DEMO_WRITE_COOLDOWN_MS > 0) {
      this.enforce(res, await this.limiter.cooldown(`demo:${safe}`, e.DEMO_WRITE_COOLDOWN_MS), 'COOLDOWN', 'The demo vault is shared: wait a moment');
    } else if (!demo && e.WRITE_COOLDOWN_MS > 0) {
      this.enforce(res, await this.limiter.cooldown(`vault:${safe}:${endpoint}`, e.WRITE_COOLDOWN_MS), 'COOLDOWN', 'Wait a moment before the next request');
    }

    if (isAddress(rawSafe, { strict: false })) await this.checkGas(rawSafe);
    return true;
  }

  private enforce(res: Response, r: LimitResult, code: 'RATE_LIMITED' | 'COOLDOWN', title: string) {
    if (r.ok) return;
    const seconds = Math.max(1, Math.ceil(r.retryAfterMs / 1000));
    res.setHeader('Retry-After', String(seconds));
    throw new HttpException(problem(code, title, `Retry in ${seconds} s`), HttpStatus.TOO_MANY_REQUESTS);
  }

  /** The agent that would sign for this vault must be able to pay gas. Fails open on RPC errors. */
  private async checkGas(safe: Address) {
    if (this.env.AGENT_MIN_GAS_WEI === 0n) return;
    let agent: Address;
    let wei: bigint;
    try {
      const vault = await this.vaults.resolve(safe);
      if (!vault) return; // the controller answers 404
      [agent] = await this.client.readContract({ address: vault.module, abi: POLICY_MODULE_ABI, functionName: 'policy' });
      wei = await this.balance(agent);
    } catch (err) {
      // The pipeline reports RPC trouble on its own; do not turn it into a misleading "low gas".
      this.log.warn(`gas check skipped for ${safe}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (wei < this.env.AGENT_MIN_GAS_WEI) {
      this.log.error(`agent ${agent} is low on gas: ${wei} wei`);
      throw new HttpException(
        problem('AGENT_LOW_GAS', 'The agent is out of gas', 'Fund the agent wallet with AVAX, then retry'),
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async balance(agent: Address): Promise<bigint> {
    const key = agent.toLowerCase();
    const hit = this.gas.get(key);
    if (hit && Date.now() - hit.at < GAS_CACHE_MS) return hit.wei;
    const wei = await this.client.getBalance({ address: agent });
    this.gas.set(key, { at: Date.now(), wei });
    return wei;
  }
}
