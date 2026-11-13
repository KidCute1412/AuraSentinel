import { Inject, Injectable } from '@nestjs/common';
import type { Address, PublicClient } from 'viem';
import { ERC20_ABI, POLICY_MODULE_ABI } from '../../core/chain/abis';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { PolicyRepository } from './policy.repository';

export interface TokenLimit {
  token: Address;
  maxPerTx: bigint;
  dailyCap: bigint;
}

export interface TokenSpent {
  token: Address;
  amount: bigint;
}

/** Everything Shield 1 needs about one module, read at a single block (P1, D4). Base units. */
export interface VaultChainState {
  blockNumber: bigint;
  /** Block timestamp (unix seconds): the clock the module itself will use. */
  now: bigint;
  policy: { agentSigner: Address; router: Address; expiry: bigint; isActive: boolean };
  epoch: bigint;
  /** One entry per whitelisted token. */
  limits: TokenLimit[];
  /** spentToday(token) for every whitelisted token, current epoch. */
  spentToday: TokenSpent[];
}

export interface TokenMeta {
  symbol: string;
  decimals: number;
}

@Injectable()
export class PolicyService {
  /** symbol/decimals never change for a deployed token. */
  private readonly meta = new Map<string, Promise<TokenMeta>>();

  constructor(
    private readonly repo: PolicyRepository,
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
  ) {}

  /**
   * Chain is the source of truth (P1): policy, limits and spentToday straight from
   * AgentPolicyModule, all pinned to one block so precheck never mixes two states.
   * Throws on RPC failure; the caller treats that as an infra error (retry), never as a verdict.
   */
  async readVaultState(module: Address): Promise<VaultChainState> {
    const block = await this.client.getBlock({ blockTag: 'latest' });
    const at = { blockNumber: block.number, allowFailure: false } as const;
    const [policy, tokens, epoch] = await this.client.multicall({
      ...at,
      contracts: [
        { address: module, abi: POLICY_MODULE_ABI, functionName: 'policy' },
        { address: module, abi: POLICY_MODULE_ABI, functionName: 'whitelistedTokens' },
        { address: module, abi: POLICY_MODULE_ABI, functionName: 'policyEpoch' },
      ],
    });
    const perToken = await this.client.multicall({
      ...at,
      contracts: tokens.flatMap((token) => [
        { address: module, abi: POLICY_MODULE_ABI, functionName: 'limits', args: [token] } as const,
        { address: module, abi: POLICY_MODULE_ABI, functionName: 'spentToday', args: [token] } as const,
      ]),
    });
    const limits: TokenLimit[] = [];
    const spentToday: TokenSpent[] = [];
    tokens.forEach((token, i) => {
      const [maxPerTx, dailyCap] = perToken[2 * i] as readonly [bigint, bigint];
      limits.push({ token, maxPerTx, dailyCap });
      spentToday.push({ token, amount: perToken[2 * i + 1] as bigint });
    });
    const [agentSigner, router, expiry, isActive] = policy;
    return {
      blockNumber: block.number,
      now: block.timestamp,
      policy: { agentSigner, router, expiry, isActive },
      epoch,
      limits,
      spentToday,
    };
  }

  /** Display metadata for the explainer. Cached per token for the life of the process. */
  tokenMeta(token: Address): Promise<TokenMeta> {
    const key = token.toLowerCase();
    let p = this.meta.get(key);
    if (!p) {
      p = this.client
        .multicall({
          allowFailure: false,
          contracts: [
            { address: token, abi: ERC20_ABI, functionName: 'symbol' },
            { address: token, abi: ERC20_ABI, functionName: 'decimals' },
          ],
        })
        .then(([symbol, decimals]) => ({ symbol, decimals }));
      p.catch(() => this.meta.delete(key));
      this.meta.set(key, p);
    }
    return p;
  }

  /** Last stored snapshot (A3 will use it as the stale fallback of GET /vaults/{safe}/state). */
  async getCurrentPolicy(): Promise<unknown> {
    return this.repo.latest();
  }
}
