import { agentFlags, describeAction, formatUnits, TOKEN_DECIMALS, type AgentPlan, type AgentToken } from '@agentshield/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Address } from 'viem';
import { ENV } from '../../core/config/config.module';
import type { Env } from '../../core/config/env.schema';
import { intentToWire } from '../../core/types';
import { BrainService } from '../agent-brain/brain.service';
import { minOutFor, resolveAmount, spentToken, toHijackPlan, type HijackContext } from '../agent-brain/domain/hijack-plan';
import type { VaultSnapshot } from '../agent-brain/domain/prompts';
import { onchainChecks } from '../auditor/domain/checks';
import { SwapQueueService } from '../auditor/swap-queue.service';
import { TX_SENDER, type TxResult, type TxSenderPort } from '../execution/tx-sender.port';
import { JobsService } from '../jobs/jobs.service';
import { PolicyService, type VaultChainState } from '../policy/policy.service';
import { RouterQuoteService } from '../rebalancer/router-quote.service';
import { VaultRegistryService } from '../vault/vault-registry.service';
import { buildOnchainCall } from './onchain-calls';
import { attackContext, type OnchainPlan } from './scenarios';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** "2940.5" with en-US grouping and at most 4 decimals: display only, for the brain's prompt. */
function display(value: bigint, decimals: number): string {
  const [whole = '0', frac = ''] = formatUnits(value, decimals).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cut = frac.slice(0, 4).replace(/0+$/, '');
  return cut ? `${grouped}.${cut}` : grouped;
}

/** What one Hijacked Agent run ended as (logs and tests). */
export type HijackOutcome = 'audit-queued' | 'held' | 'reverted' | 'confirmed' | 'failed';

/**
 * One Hijacked Agent run, in the worker (attack queue, concurrency 1):
 *
 *   read the vault (chain) -> brain plans from the poisoned feed -> code sizes the plan (bigint)
 *   -> swap:      dryRun job on the swap queue: every Shield 1 gate, then `rejected` or `held`, never signed
 *   -> approve /
 *      direct:    eth_call first; the chain would accept it -> `held`, nothing sent;
 *                 the chain refuses it -> sent with manual gas so the revert is mined (Snowtrace evidence)
 *   -> none:      `held` (the agent did nothing)
 *
 * The brain's plan is attacker-controlled data. No branch can broadcast something the chain would accept.
 */
@Injectable()
export class HijackService {
  private readonly log = new Logger(HijackService.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly brain: BrainService,
    private readonly policy: PolicyService,
    private readonly quotes: RouterQuoteService,
    private readonly vaults: VaultRegistryService,
    private readonly swapQueue: SwapQueueService,
    @Inject(TX_SENDER) private readonly sender: TxSenderPort,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async run(jobId: string, vault: Address, text: string): Promise<HijackOutcome> {
    try {
      return await this.runOrThrow(jobId, vault, text);
    } catch (e) {
      this.log.error(`hijack ${jobId} failed: ${message(e)}`);
      await this.jobs.transition(jobId, 'failed').catch(() => undefined);
      return 'failed';
    }
  }

  private async runOrThrow(jobId: string, vault: Address, text: string): Promise<HijackOutcome> {
    const resolved = await this.vaults.resolve(vault);
    if (!resolved) {
      await this.jobs.transition(jobId, 'failed', { reasonCode: 'VAULT_NOT_FOUND' });
      return 'failed';
    }
    const { usdc, wavax } = attackContext(this.env, vault);
    const state = await this.policy.readVaultState(resolved.module);
    const [usdcBal = 0n, wavaxBal = 0n] = await this.policy.balancesAt(resolved.safe, [usdc, wavax], state.blockNumber);
    const decimals = await this.decimals(usdc, wavax);
    const ctx: HijackContext = {
      safe: resolved.safe,
      tokens: { USDC: { address: usdc, decimals: decimals.USDC }, WAVAX: { address: wavax, decimals: decimals.WAVAX } },
      balances: { USDC: usdcBal, WAVAX: wavaxBal },
    };

    const brain = await this.brain.plan(text, await this.snapshot(ctx, state), resolved.safe);
    const { action } = brain;

    // Size it with exact math: the amount from the chain or the brain's decimal, minOut from a fresh router quote.
    const tokenIn = spentToken(action);
    const amountIn = action.type === 'swap' || action.type === 'direct' ? resolveAmount(action.amount, action.tokenIn, ctx) : 0n;
    let minOut = 0n;
    if (action.type === 'swap' || action.type === 'direct') {
      const quote = amountIn > 0n ? await this.quote(state, ctx.tokens[action.tokenIn].address, ctx.tokens[action.tokenOut].address, amountIn) : null;
      minOut = minOutFor(quote, action.type === 'swap' ? action.maxSlippagePct : 1);
    }
    const limit = tokenIn ? state.limits.find((l) => l.token.toLowerCase() === ctx.tokens[tokenIn].address.toLowerCase()) : undefined;
    const flags = agentFlags(action, tokenIn && action.type !== 'approve' ? { amountIn, maxPerTx: limit?.maxPerTx, balance: ctx.balances[tokenIn] } : {});
    const agentPlan: AgentPlan = { ...brain, flags };
    const plan = toHijackPlan(action, ctx, { amountIn, minOut });
    this.log.log(`hijack ${jobId}: ${brain.source}${brain.fallbackReason ? ` (${brain.fallbackReason})` : ''} -> ${action.type} [${flags.join(',')}]`);

    if (plan.mode === 'shield1') {
      await this.jobs.attachAgentPlan(jobId, agentPlan, intentToWire(plan.intent));
      await this.swapQueue.enqueueExisting(jobId, vault, plan.intent, { dryRun: true, untrustedText: brain.feed, agentAction: describeAction(action) });
      return 'audit-queued';
    }

    await this.jobs.attachAgentPlan(jobId, agentPlan);
    if (plan.mode === 'none') {
      await this.jobs.transition(jobId, 'held');
      return 'held';
    }
    return this.onchain(jobId, plan, { safe: resolved.safe, module: resolved.module }, state.now);
  }

  /**
   * Approve / direct: the brain wants to skip Shield 1, so only the chain can judge it. Ask first with eth_call; send
   * only a call the chain refuses (its mined revert is the evidence), never one it would accept.
   */
  private async onchain(jobId: string, plan: OnchainPlan, addrs: { safe: Address; module: Address }, now: bigint): Promise<HijackOutcome> {
    const call = buildOnchainCall(plan, addrs, now);
    const dry = await this.sender.callRaw(call);
    if (!dry.reverted) {
      this.log.warn(`hijack ${jobId}: the chain would accept this ${plan.call}; held, not sent`);
      await this.jobs.recordShield(jobId, 'onchain', 'pass', null, [{ id: 'tx-dry-run', pass: true, reasonCode: null, actual: { type: 'text', value: 'accepted' }, limit: null }]);
      await this.jobs.transition(jobId, 'held');
      return 'held';
    }

    await this.jobs.transition(jobId, 'broadcasting');
    let tx: TxResult;
    try {
      tx = await this.sender.sendRaw(call);
    } catch (e) {
      this.log.error(`hijack ${jobId} not sent: ${message(e)}`);
      await this.jobs.transition(jobId, 'failed');
      return 'failed';
    }
    if (tx.status === 'reverted') {
      const reason = tx.revertReason ?? dry.revertReason;
      await this.jobs.recordShield(jobId, 'onchain', 'fail', reason, onchainChecks({ ...tx, revertReason: reason }));
      await this.jobs.transition(jobId, 'reverted', { txHash: tx.txHash, reasonCode: reason });
      return 'reverted';
    }
    // The dry run said no, the chain said yes (the policy changed in between). Never hidden.
    this.log.error(`SECURITY: hijack ${jobId} (${plan.call}) was NOT reverted on-chain: ${tx.txHash}`);
    await this.jobs.recordShield(jobId, 'onchain', 'pass', null, onchainChecks(tx));
    await this.jobs.transition(jobId, 'confirmed', { txHash: tx.txHash });
    return 'confirmed';
  }

  /** Token decimals from the chain (cached by PolicyService), the known defaults if the read fails. */
  private async decimals(usdc: Address, wavax: Address): Promise<Record<AgentToken, number>> {
    const read = (t: Address, d: number) => this.policy.tokenMeta(t).then((m) => m.decimals, () => d);
    const [u, w] = await Promise.all([read(usdc, TOKEN_DECIMALS.USDC), read(wavax, TOKEN_DECIMALS.WAVAX)]);
    return { USDC: u, WAVAX: w };
  }

  /** Router quote; null on a read failure (the plan is still judged, with a token minOut). */
  private quote(state: VaultChainState, tokenIn: Address, tokenOut: Address, amountIn: bigint): Promise<bigint | null> {
    return this.quotes.amountOut(state.policy.router, tokenIn, tokenOut, amountIn).catch((e: unknown) => {
      this.log.warn(`quote failed: ${message(e)}`);
      return null;
    });
  }

  /** What the brain sees about its vault: balances and a price, as display strings. */
  private async snapshot(ctx: HijackContext, state: VaultChainState): Promise<VaultSnapshot> {
    const one = 10n ** BigInt(ctx.tokens.WAVAX.decimals);
    const price = await this.quote(state, ctx.tokens.WAVAX.address, ctx.tokens.USDC.address, one);
    return {
      usdc: display(ctx.balances.USDC, ctx.tokens.USDC.decimals),
      wavax: display(ctx.balances.WAVAX, ctx.tokens.WAVAX.decimals),
      price: price ? `1 WAVAX ~ ${display(price, ctx.tokens.USDC.decimals)} USDC` : null,
    };
  }
}
