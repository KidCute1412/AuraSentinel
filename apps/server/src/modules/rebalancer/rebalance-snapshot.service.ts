import { Inject, Injectable } from '@nestjs/common';
import type { Address, PublicClient } from 'viem';
import { ERC20_ABI } from '../../core/chain/abis';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';
import { SwapQueueService } from '../auditor/swap-queue.service';
import { PolicyService } from '../policy/policy.service';
import { VaultRegistryService } from '../vault/vault-registry.service';
import { quoteSample } from './domain/rebalance.math';
import type { VaultSnapshot } from './domain/rebalance.plan';
import { toSnapshot } from './domain/rebalance.snapshot';
import { RouterQuoteService } from './router-quote.service';

export interface LoadedVault {
  snapshot: VaultSnapshot;
  /** Router from the vault's own policy: the swap is re-quoted on it before queueing. */
  router: Address;
}

/** I/O half of a rebalance tick: everything one vault's decision needs, read from the chain (P1). */
@Injectable()
export class RebalanceSnapshotService {
  constructor(
    private readonly vaults: VaultRegistryService,
    private readonly policy: PolicyService,
    private readonly quotes: RouterQuoteService,
    private readonly swapQueue: SwapQueueService,
    @Inject(PUBLIC_CLIENT) private readonly client: PublicClient,
  ) {}

  /**
   * null when `safe` is not a Safe with an AgentPolicyModule. Throws on RPC failure; the tick
   * logs it and moves on to the next vault.
   */
  async read(safe: Address, tokenA: Address, tokenB: Address): Promise<LoadedVault | null> {
    const vault = await this.vaults.resolve(safe);
    if (!vault) return null;

    const state = await this.policy.readVaultState(vault.module);
    // Balances pinned to the same block as policy and spend, so the decision never mixes two states.
    const [balanceA, balanceB] = await this.client.multicall({
      blockNumber: state.blockNumber,
      allowFailure: false,
      contracts: [
        { address: tokenA, abi: ERC20_ABI, functionName: 'balanceOf', args: [vault.safe] },
        { address: tokenB, abi: ERC20_ABI, functionName: 'balanceOf', args: [vault.safe] },
      ],
    });
    const { decimals } = await this.policy.tokenMeta(tokenA);
    const sampleIn = quoteSample(decimals);
    const quotedOut = await this.quotes.amountOut(state.policy.router, tokenA, tokenB, sampleIn);
    const hasPendingSwap = await this.swapQueue.hasPending(vault.safe);

    return {
      router: state.policy.router,
      snapshot: toSnapshot({
        safe: vault.safe,
        isDemo: vault.isDemo,
        isActive: state.policy.isActive,
        expiry: state.policy.expiry,
        now: state.now,
        limits: state.limits,
        spentToday: state.spentToday,
        tokenA,
        tokenB,
        balanceA,
        balanceB,
        sampleIn,
        quotedOut,
        hasPendingSwap,
      }),
    };
  }
}
