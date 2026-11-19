import type { AdminOverviewDto, JobListDto, PreflightDto, QueueName, RebalancerStatusDto, TickSummaryDto } from '@agentshield/shared';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { getAddress, zeroAddress, type Address, type PublicClient } from 'viem';
import { POLICY_MODULE_ABI, SWAP_GAS_USED } from '../../core/chain/abis';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { QUEUES } from '../../core/queue/queue.constants';
import type { JobStatus } from '../../core/types';
import { HealthService } from '../health/health.service';
import { INDEXER_CURSOR, IndexerRepository } from '../indexer/indexer.repository';
import { JobsService } from '../jobs/jobs.service';
import { ProofService } from '../proof/proof.service';
import { VaultRegistryService } from '../vault/vault-registry.service';
import { VaultService } from '../vault/vault.service';
import { evaluatePreflight, swapsLeft, type DemoVaultReads, type Read } from './domain/preflight';

/** The console's job filters: "blocked" covers both shields (Shield 1 rejected, Shield 2 reverted on chain). */
export const JOB_FILTERS = { all: undefined, blocked: ['rejected', 'reverted'], failed: ['failed'] } as const satisfies Record<
  string,
  readonly JobStatus[] | undefined
>;
export type JobFilter = keyof typeof JOB_FILTERS;

const HOUR_MS = 3_600_000;

/** Settle a read into the preflight's Read type: one failing source never takes the whole console down. */
async function read<T>(p: Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.split('\n')[0]!.slice(0, 160) : String(e) };
  }
}

interface TickReturn {
  blockNumber: string | null;
  queued: string[];
  skipped: { safe: string; reason: string }[];
}

/**
 * Admin console (api.md §9): read-only views of the stack plus the rebalancer's switch. Holds no key: the agent's
 * address comes from the demo vault's policy, and nothing here can move funds or change a policy (P2).
 */
@Injectable()
export class AdminService {
  constructor(
    @InjectQueue(QUEUES.rebalance) private readonly rebalance: Queue,
    @InjectQueue(QUEUES.swap) private readonly swap: Queue,
    @InjectQueue(QUEUES.attack) private readonly attack: Queue,
    private readonly health: HealthService,
    private readonly jobs: JobsService,
    private readonly proof: ProofService,
    private readonly registry: VaultRegistryService,
    private readonly vault: VaultService,
    private readonly indexer: IndexerRepository,
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---------- Rebalancer ----------

  async rebalancer(): Promise<RebalancerStatusDto> {
    const [paused, lastTick, agent] = await Promise.all([this.rebalance.isPaused(), this.lastTick(), this.agent()]);
    return {
      paused,
      intervalMs: this.env.REBALANCE_INTERVAL_MS,
      lastTickAt: lastTick?.at ?? null,
      lastTick,
      agent,
    };
  }

  async setPaused(paused: boolean): Promise<RebalancerStatusDto> {
    if (paused) await this.rebalance.pause();
    else await this.rebalance.resume();
    return this.rebalancer();
  }

  isPaused(): Promise<boolean> {
    return this.rebalance.isPaused();
  }

  /** One tick now, on top of the schedule. The processor's per-vault claims keep it from double-queuing a swap. */
  async runTick(): Promise<{ jobId: string }> {
    const job = await this.rebalance.add('tick', {}, { jobId: `manual-${Date.now()}` });
    return { jobId: job.id ?? 'unknown' };
  }

  private async lastTick(): Promise<TickSummaryDto | null> {
    const [last] = await this.rebalance.getJobs(['completed'], 0, 0, false);
    if (!last?.finishedOn) return null;
    const r = (last.returnvalue ?? null) as TickReturn | null;
    return {
      at: new Date(last.finishedOn).toISOString(),
      blockNumber: r?.blockNumber ?? null,
      queued: r?.queued?.length ?? 0,
      skipped: (r?.skipped ?? []).map((s) => ({ safe: getAddress(s.safe), reason: s.reason })),
    };
  }

  /** The agent named by the demo vault's policy, its balance and how many swaps that still pays for. */
  private async agent(): Promise<RebalancerStatusDto['agent']> {
    try {
      const address = await this.agentAddress();
      const [wei, fees] = await Promise.all([this.client.getBalance({ address }), this.client.estimateFeesPerGas().catch(() => null)]);
      return {
        address: getAddress(address),
        avaxBalance: wei.toString(),
        lowGas: wei < this.env.AGENT_MIN_GAS_WEI,
        swapsLeft: swapsLeft(wei, fees?.maxFeePerGas ?? null, SWAP_GAS_USED),
      };
    } catch {
      return { address: zeroAddress, avaxBalance: '0', lowGas: true, swapsLeft: null };
    }
  }

  private async agentAddress(): Promise<Address> {
    const module = this.env.POLICY_MODULE_ADDRESS;
    if (!module) throw new Error('POLICY_MODULE_ADDRESS is not set');
    const [address] = await this.client.readContract({ address: module, abi: POLICY_MODULE_ABI, functionName: 'policy' });
    return address;
  }

  // ---------- Preflight ----------

  async preflight(now = new Date()): Promise<PreflightDto> {
    const [services, anvil, gas, demo, indexer, paused, proof, recent] = await Promise.all([
      read(this.health.check()),
      read(anvilUp(this.env.ANVIL_RPC_URL)),
      read(this.gas()),
      this.env.SAFE_ADDRESS ? read(this.demoVault(this.env.SAFE_ADDRESS)) : Promise.resolve(null),
      read(this.indexerLag()),
      read(this.rebalance.isPaused()),
      read(this.proof.get()),
      read(this.jobs.countsSince(new Date(now.getTime() - HOUR_MS))),
    ]);
    return evaluatePreflight({
      now,
      services: services.ok
        ? {
            ok: true,
            value: {
              postgres: services.value.postgres === 'up',
              redis: services.value.redis === 'up',
              rpc: services.value.rpc === 'up',
              worker: services.value.worker === 'up',
              anvil: anvil.ok && anvil.value,
            },
          }
        : services,
      gas,
      minGasWei: this.env.AGENT_MIN_GAS_WEI,
      gasUsedPerSwap: SWAP_GAS_USED,
      demo,
      indexer,
      paused,
      geminiConfigured: !!this.env.GEMINI_API_KEY,
      blockedTxs: proof.ok ? { ok: true, value: proof.value.blockedTxs.length } : proof,
      failedLastHour: recent.ok ? { ok: true, value: recent.value.byStatus.failed ?? 0 } : recent,
    });
  }

  private async gas(): Promise<{ balance: bigint; maxFeePerGas: bigint | null }> {
    const address = await this.agentAddress();
    const [balance, fees] = await Promise.all([this.client.getBalance({ address }), this.client.estimateFeesPerGas().catch(() => null)]);
    return { balance, maxFeePerGas: fees?.maxFeePerGas ?? null };
  }

  private async demoVault(safe: Address): Promise<DemoVaultReads> {
    const s = await this.vault.getState(safe);
    const usdc = (this.env.TOKEN_A_ADDRESS ?? '').toLowerCase();
    const limit = s.policy.limits.find((l) => l.token.toLowerCase() === usdc);
    return {
      isActive: s.isActive,
      expiry: s.policy.expiry,
      dailyCap: limit ? BigInt(limit.dailyCap) : null,
      spentToday: BigInt(s.spentToday.find((x) => x.token.toLowerCase() === usdc)?.amount ?? '0'),
      usdcBalance: BigInt(s.balances.find((b) => b.token.toLowerCase() === usdc)?.amount ?? '0'),
    };
  }

  private async indexerLag(): Promise<{ cursor: bigint | null; head: bigint }> {
    const [cursor, head] = await Promise.all([this.indexer.getCursor(INDEXER_CURSOR), this.client.getBlockNumber()]);
    return { cursor: cursor ?? null, head };
  }

  // ---------- Activity ----------

  async overview(now = new Date()): Promise<AdminOverviewDto> {
    const queues: [QueueName, Queue][] = [
      ['swap', this.swap],
      ['attack', this.attack],
      ['rebalance', this.rebalance],
    ];
    const [counts, stats, timings, vaults] = await Promise.all([
      Promise.all(queues.map(([, q]) => q.getJobCounts('waiting', 'paused', 'prioritized', 'active', 'delayed', 'failed'))),
      this.jobs.countsSince(new Date(now.getTime() - 24 * HOUR_MS)),
      this.jobs.txTimings(50),
      this.registry.list(),
    ]);
    const max = this.env.REBALANCE_MAX_VAULTS;
    let slot = 0;
    return {
      queues: queues.map(([name], i) => {
        const c = counts[i]!;
        return { name, waiting: (c.waiting ?? 0) + (c.paused ?? 0) + (c.prioritized ?? 0), active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0 };
      }),
      last24h: {
        total: stats.total,
        confirmed: stats.byStatus.confirmed ?? 0,
        rejected: stats.byStatus.rejected ?? 0,
        reverted: stats.byStatus.reverted ?? 0,
        failed: stats.byStatus.failed ?? 0,
        attacks: stats.attacks,
        medianMinedMs: median(timings.map((t) => t.minedAt.getTime() - t.sentAt.getTime())),
      },
      vaults: vaults.map((v) => {
        const position = v.isDemo ? null : ++slot;
        return {
          safe: getAddress(v.safe),
          owner: getAddress(v.owner),
          module: getAddress(v.module),
          createdAtBlock: v.createdAtBlock.toString(),
          isDemo: v.isDemo,
          rebalanceSlot: position !== null && (max === 0 || position <= max) ? position : null,
        };
      }),
      maxRebalancedVaults: max,
    };
  }

  /** Every vault's jobs, newest first. */
  jobsList(filter: JobFilter, limit: number, cursor?: string): Promise<JobListDto> {
    return this.jobs.listByVault({ limit, cursor, status: JOB_FILTERS[filter] });
  }
}

/** The simulation fork answers eth_blockNumber within 2 s. */
export async function anvilUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal: AbortSignal.timeout(2_000),
    });
    const body = (await res.json()) as { result?: unknown };
    return res.ok && typeof body.result === 'string';
  } catch {
    return false;
  }
}

/** Median of non-negative durations (ms), rounded; null without samples. */
export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return Math.round(v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2);
}
