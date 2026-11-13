import type { StateDto, VaultDto, VaultListDto } from '@agentshield/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { getAddress, type Address, type PublicClient } from 'viem';
import { ERC20_ABI, POLICY_MODULE_ABI } from '../../core/chain/abis';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { PolicyService } from '../policy/policy.service';
import { toStateDto } from './domain/state';
import { VaultRegistryService } from './vault-registry.service';

/** Polling UIs hit this every second; one chain read per vault per window is enough. */
const FRESH_MS = 1_000;
/** With a snapshot in hand, wait at most this long for the chain before answering stale. */
const STALE_AFTER_MS = 2_000;

export class VaultNotFoundError extends Error {}
export class ChainUnavailableError extends Error {}

@Injectable()
export class VaultService {
  private readonly log = new Logger(VaultService.name);
  /** Last good state per vault: served fresh within FRESH_MS, and as `stale: true` when RPC fails. */
  private readonly last = new Map<string, { at: number; dto: StateDto }>();
  private readonly inflight = new Map<string, Promise<StateDto>>();
  /** Overridable in tests. */
  freshMs = FRESH_MS;
  staleAfterMs = STALE_AFTER_MS;

  constructor(
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
    @Inject(ENV) private readonly env: Env,
    private readonly registry: VaultRegistryService,
    private readonly policy: PolicyService,
  ) {}

  /** GET /vaults (api.md #5): the registry. Policy/spend are never here (P1). */
  async listVaults(): Promise<VaultListDto> {
    const rows = await this.registry.list();
    const vaults = await Promise.all(
      rows.map(async (r) => {
        // The env demo vault before the indexer saw it: owner comes from the module itself.
        const owner = r.owner ? getAddress(r.owner) : await this.getVault(r.safe as Address).then((v) => v.owner, () => null);
        if (!owner) return null;
        return { safe: getAddress(r.safe), module: getAddress(r.module), owner, isDemo: r.isDemo, createdAtBlock: r.createdAtBlock.toString() };
      }),
    );
    return { vaults: vaults.filter((v): v is NonNullable<typeof v> => v !== null) };
  }

  /** GET /vaults/{safe} (api.md #6): who owns and runs the vault, read from the module. */
  async getVault(safe: Address): Promise<VaultDto> {
    let vault;
    let owner: Address;
    let policy: readonly [Address, Address, bigint, boolean];
    try {
      vault = await this.registry.resolve(safe);
      if (!vault) throw new VaultNotFoundError(safe);
      [owner, policy] = await this.client.multicall({
        allowFailure: false,
        contracts: [
          { address: vault.module, abi: POLICY_MODULE_ABI, functionName: 'owner' },
          { address: vault.module, abi: POLICY_MODULE_ABI, functionName: 'policy' },
        ],
      });
    } catch (e) {
      if (e instanceof VaultNotFoundError) throw e;
      throw new ChainUnavailableError(e instanceof Error ? e.message : String(e));
    }
    const checksummed = getAddress(vault.safe);
    return {
      safe: checksummed,
      module: getAddress(vault.module),
      owner: getAddress(owner),
      agent: getAddress(policy[0]),
      isDemo: vault.isDemo,
      registered: true,
      explorer: `https://testnet.snowtrace.io/address/${checksummed}`,
    };
  }

  /**
   * GET /vaults/{safe}/state: balances, policy, spentToday, isActive straight from the chain (P1),
   * all at one block. Nothing here is stored in Postgres. RPC down -> last good snapshot, stale.
   */
  async getState(safe: Address): Promise<StateDto> {
    const key = safe.toLowerCase();
    const hit = this.last.get(key);
    if (hit && Date.now() - hit.at < this.freshMs) return hit.dto;

    let p = this.inflight.get(key);
    if (!p) {
      p = this.read(safe)
        .then((dto) => {
          this.last.set(key, { at: Date.now(), dto });
          return dto;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    try {
      return await (hit ? withDeadline(p, this.staleAfterMs) : p);
    } catch (e) {
      if (e instanceof VaultNotFoundError) throw e;
      this.log.warn(`state of ${safe} from chain failed or slow: ${e instanceof Error ? e.message : String(e)}`);
      if (hit) return { ...hit.dto, stale: true };
      throw new ChainUnavailableError('RPC unavailable and no snapshot yet');
    }
  }

  private async read(safe: Address): Promise<StateDto> {
    const vault = await this.registry.resolve(safe);
    if (!vault) throw new VaultNotFoundError(safe);
    const s = await this.policy.readVaultState(vault.module);
    const tokens = s.limits.map((l) => l.token);
    const [amounts, metas] = await Promise.all([
      this.client.multicall({
        blockNumber: s.blockNumber,
        allowFailure: false,
        contracts: tokens.map((t) => ({ address: t, abi: ERC20_ABI, functionName: 'balanceOf', args: [vault.safe] }) as const),
      }),
      Promise.all(tokens.map((t) => this.policy.tokenMeta(t))),
    ]);
    return toStateDto({
      safe: getAddress(vault.safe),
      blockNumber: s.blockNumber,
      now: s.now,
      epoch: s.epoch,
      policy: s.policy,
      limits: s.limits,
      spentToday: s.spentToday,
      balances: tokens.map((token, i) => ({ token, ...metas[i]!, amount: amounts[i] as bigint })),
      budgetToken: this.env.TOKEN_A_ADDRESS,
    });
  }
}

class DeadlineError extends Error {}

/** Rejects after ms; the underlying read keeps running and refreshes the cache when it lands. */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(`no answer in ${ms} ms`)), ms);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}
