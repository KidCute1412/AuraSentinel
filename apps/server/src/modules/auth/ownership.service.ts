import { Inject, Injectable } from '@nestjs/common';
import { getAddress, type Address, type PublicClient } from 'viem';
import { SAFE_MODULE_ABI } from '../../core/chain/abis';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { VaultRegistryService } from '../vault/vault-registry.service';

const OWNERS_TTL_MS = 30_000;

/**
 * Who owns a vault, read from the Safe on every check (cached 30 s, api.md §3): the chain is the
 * source of truth (P1), the session only proves an address. Owners added or removed on the Safe
 * take effect within the cache window, no re-login needed.
 */
@Injectable()
export class OwnershipService {
  private readonly owners = new Map<string, { at: number; owners: Set<string> }>();

  constructor(
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
    @Inject(ENV) private readonly env: Env,
    private readonly vaults: VaultRegistryService,
  ) {}

  isAdmin(address: string): boolean {
    return this.env.ADMIN_ADDRESSES.includes(address.toLowerCase());
  }

  async isOwner(address: string, safe: Address): Promise<boolean> {
    return (await this.ownersOf(safe)).has(address.toLowerCase());
  }

  /** Registered vaults this address owns on chain. A Safe that cannot be read is skipped. */
  async ownedVaults(address: string): Promise<Address[]> {
    const rows = await this.vaults.list();
    const owned = await Promise.all(
      rows.map(async (v) => ((await this.isOwner(address, v.safe as Address).catch(() => false)) ? getAddress(v.safe) : null)),
    );
    return owned.filter((v): v is Address => v !== null);
  }

  private async ownersOf(safe: Address): Promise<Set<string>> {
    const key = safe.toLowerCase();
    const hit = this.owners.get(key);
    if (hit && Date.now() - hit.at < OWNERS_TTL_MS) return hit.owners;
    const list = await this.client.readContract({ address: safe, abi: SAFE_MODULE_ABI, functionName: 'getOwners' });
    const owners = new Set(list.map((a) => a.toLowerCase()));
    this.owners.set(key, { at: Date.now(), owners });
    return owners;
  }
}
