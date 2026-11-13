import { Inject, Injectable, Logger } from '@nestjs/common';
import { getAddress, isAddressEqual, type Address, type PublicClient } from 'viem';
import { POLICY_MODULE_ABI, SAFE_MODULE_ABI } from '../../core/chain/abis';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import type { VaultTarget } from '../../core/types';

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
 * Which AgentPolicyModule guards a Safe, found on chain (P1) until A3/A8 add the `vaults`
 * registry table: walk the Safe's enabled modules and keep the one whose `safe()` points back
 * at this Safe. The env demo vault short-circuits the RPC so the demo never depends on it.
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
  ) {}

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
