import { Inject, Injectable, Logger } from '@nestjs/common';
import { getAddress, isAddressEqual, type Address, type PublicClient } from 'viem';
import { POLICY_MODULE_ABI, SAFE_MODULE_ABI } from '../../core/chain/abis';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import type { VaultTarget } from '../../core/types';
import { VaultsRepository, type VaultRow } from './vaults.repository';

/** Safe ModuleManager linked-list head. */
const SENTINEL = '0x0000000000000000000000000000000000000001' as const;
const PAGE = 10n;
const HIT_TTL_MS = 60_000;
const MISS_TTL_MS = 5_000;

export interface ResolvedVault extends VaultTarget {
  /** The public demo vault from env (D12/D15): guests may run jobs on it. */
  isDemo: boolean;
}

/**
 * Which AgentPolicyModule guards a Safe. Order: the env demo vault (no I/O, the demo never
 * depends on RPC or DB), then the `vaults` registry the indexer fills from ModuleDeployed (A8),
 * then the chain itself (P1): walk the Safe's enabled modules and keep the one whose `safe()`
 * points back at this Safe (vaults created before the indexer started, or a lagging indexer).
 *
 * The target always comes from here, never from the intent (`recipient` is attacker-controlled).
 */
@Injectable()
export class VaultRegistryService {
  private readonly log = new Logger(VaultRegistryService.name);
  private readonly cache = new Map<string, { at: number; vault: ResolvedVault | null }>();

  constructor(
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
    @Inject(ENV) private readonly env: Env,
    private readonly repo: VaultsRepository,
  ) {}

  /** Indexer: a ModuleDeployed was seen. True only the first time (publish vault.registered once). */
  async register(v: { safe: Address; module: Address; owner: Address; createdAtBlock: bigint }): Promise<boolean> {
    const inserted = await this.repo.insert(v);
    this.cache.delete(v.safe.toLowerCase()); // a cached miss must not hide the new vault
    return inserted;
  }

  /** GET /vaults: the registry, plus the env demo vault if the indexer has not seen it. */
  async list(): Promise<(VaultRow & { isDemo: boolean })[]> {
    const rows = await this.repo.list();
    const out = rows.map((r) => ({ ...r, isDemo: this.isDemo(r.safe as Address) }));
    const { SAFE_ADDRESS: demo, POLICY_MODULE_ADDRESS: module } = this.env;
    if (demo && module && !out.some((r) => r.isDemo)) {
      out.unshift({ safe: demo.toLowerCase(), module: module.toLowerCase(), owner: '', createdAtBlock: 0n, registeredAt: new Date(0), isDemo: true });
    }
    return out;
  }

  isDemo(safe: Address): boolean {
    return !!this.env.SAFE_ADDRESS && isAddressEqual(safe, this.env.SAFE_ADDRESS);
  }

  /** null when the address is not a Safe with an AgentPolicyModule enabled. Throws only on RPC failure. */
  async resolve(safe: Address): Promise<ResolvedVault | null> {
    const key = safe.toLowerCase();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < (hit.vault ? HIT_TTL_MS : MISS_TTL_MS)) return hit.vault;

    const vault = await this.lookup(getAddress(safe));
    this.cache.set(key, { at: Date.now(), vault });
    return vault;
  }

  private async lookup(safe: Address): Promise<ResolvedVault | null> {
    if (this.isDemo(safe) && this.env.POLICY_MODULE_ADDRESS) {
      return { safe, module: this.env.POLICY_MODULE_ADDRESS, isDemo: true };
    }
    const row = await this.repo.bySafe(safe);
    if (row) return { safe, module: getAddress(row.module), isDemo: this.isDemo(safe) };

    const code = await this.client.getCode({ address: safe });
    if (!code || code === '0x') return null;

    let modules: readonly Address[];
    try {
      [modules] = await this.client.readContract({
        address: safe,
        abi: SAFE_MODULE_ABI,
        functionName: 'getModulesPaginated',
        args: [SENTINEL, PAGE],
      });
    } catch {
      return null; // a contract, but not a Safe
    }
    for (const module of modules) {
      const owner = await this.client
        .readContract({ address: module, abi: POLICY_MODULE_ABI, functionName: 'safe' })
        .catch(() => null);
      if (owner && isAddressEqual(owner, safe)) return { safe, module, isDemo: this.isDemo(safe) };
    }
    this.log.debug(`no AgentPolicyModule enabled on ${safe}`);
    return null;
  }
}
