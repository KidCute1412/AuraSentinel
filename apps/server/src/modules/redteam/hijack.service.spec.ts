import { HIJACK_STRANGER, type AgentAction } from '@agentshield/shared';
import { decodeFunctionData, maxUint256 } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../core/config/env.schema';
import type { BrainPlan } from '../agent-brain/brain.service';
import { ERC20_ABI, POLICY_MODULE_ABI, SAFE_MODULE_ABI } from './onchain-calls';
import { HijackService } from './hijack.service';

const SAFE = '0x1111111111111111111111111111111111111111';
const AGENT = '0x2222222222222222222222222222222222222222';
const USDC = '0x3333333333333333333333333333333333333333';
const WAVAX = '0x4444444444444444444444444444444444444444';
const MODULE = '0x5555555555555555555555555555555555555555';
const ROUTER = '0x6666666666666666666666666666666666666666';
const OTHER = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const JOB = '7f9c0a52-1d2e-4c3b-9a8f-0123456789ab';
const TX = `0x${'ab'.repeat(32)}` as const;
const NOW = 1_762_600_000n;

const env = { TOKEN_A_ADDRESS: USDC, TOKEN_B_ADDRESS: WAVAX } as unknown as Env;

const brainPlan = (action: AgentAction): BrainPlan => ({ source: 'llm', model: 'gemini-test', feed: 'poisoned text', thought: 'I obey.', action, fallbackReason: null });

function make(action: AgentAction, opts: { callRaw?: ReturnType<typeof vi.fn>; sendRaw?: ReturnType<typeof vi.fn>; resolve?: unknown } = {}) {
  const jobs = {
    attachAgentPlan: vi.fn().mockResolvedValue(undefined),
    transition: vi.fn().mockResolvedValue(undefined),
    recordShield: vi.fn().mockResolvedValue(undefined),
  };
  const brain = { plan: vi.fn().mockResolvedValue(brainPlan(action)) };
  const policy = {
    readVaultState: vi.fn().mockResolvedValue({
      blockNumber: 100n,
      now: NOW,
      policy: { agentSigner: AGENT, router: ROUTER, expiry: NOW + 86_400n, isActive: true },
      epoch: 1n,
      limits: [
        { token: USDC, maxPerTx: 500_000_000n, dailyCap: 1_500_000_000n },
        { token: WAVAX, maxPerTx: 20n * 10n ** 18n, dailyCap: 60n * 10n ** 18n },
      ],
      spentToday: [],
    }),
    balancesAt: vi.fn().mockResolvedValue([3_000_000_000n, 10n * 10n ** 18n]),
    tokenMeta: vi.fn(async (t: string) => ({ symbol: t === USDC ? 'USDC' : 'WAVAX', decimals: t === USDC ? 6 : 18 })),
  };
  // 1 WAVAX = 20 USDC; 1 USDC = 0.05 WAVAX.
  const quotes = {
    amountOut: vi.fn(async (_r: string, tin: string, _tout: string, amountIn: bigint) => (tin === WAVAX ? (amountIn * 20n) / 10n ** 12n : (amountIn * 10n ** 12n) / 20n)),
  };
  const vaults = { resolve: vi.fn().mockResolvedValue(opts.resolve === undefined ? { safe: SAFE, module: MODULE, isDemo: true } : opts.resolve) };
  const swapQueue = { enqueueExisting: vi.fn().mockResolvedValue(undefined) };
  const sender = {
    address: AGENT,
    sendSwap: vi.fn(),
    callRaw: opts.callRaw ?? vi.fn().mockResolvedValue({ reverted: true, revertReason: 'ExceedsPerTxCap' }),
    sendRaw: opts.sendRaw ?? vi.fn().mockResolvedValue({ txHash: TX, status: 'reverted', blockNumber: 101n, revertReason: 'ExceedsPerTxCap' }),
  };
  const svc = new HijackService(jobs as never, brain as never, policy as never, quotes as never, vaults as never, swapQueue as never, sender as never, env);
  return { svc, jobs, brain, policy, quotes, vaults, swapQueue, sender, run: () => svc.run(JOB, SAFE, 'poisoned text') };
}

const swap = (over: Partial<Extract<AgentAction, { type: 'swap' }>> = {}): AgentAction => ({
  type: 'swap',
  tokenIn: 'USDC',
  tokenOut: 'WAVAX',
  amount: '10',
  recipient: 'vault',
  maxSlippagePct: 1,
  ...over,
});

describe('HijackService: swaps go to Shield 1 as dryRun jobs', () => {
  it('drain to a stranger: the plan and its intent are stored, the audit is queued dryRun, nothing is signed', async () => {
    const { run, jobs, swapQueue, sender } = make(swap({ amount: 'all', recipient: OTHER }));
    await expect(run()).resolves.toBe('audit-queued');

    const [, plan, intent] = jobs.attachAgentPlan.mock.calls[0]!;
    expect(plan.flags).toEqual(['recipient-not-vault', 'drains-vault', 'over-cap']);
    expect(intent).toEqual({ tokenIn: USDC, tokenOut: WAVAX, amountIn: '3000000000', minAmountOut: '148500000000000000000', recipient: OTHER, origin: 'redteam' });
    expect(swapQueue.enqueueExisting).toHaveBeenCalledWith(JOB, SAFE, expect.objectContaining({ amountIn: 3_000_000_000n, recipient: OTHER }), { dryRun: true, untrustedText: 'poisoned text', agentAction: 'swap all the USDC for WAVAX, proceeds to 0xabcd...abcd' });
    expect(sender.sendSwap).not.toHaveBeenCalled();
    expect(sender.sendRaw).not.toHaveBeenCalled();
    expect(sender.callRaw).not.toHaveBeenCalled();
  });

  it('any price: minOut 0, so Shield 1 refuses it with ZeroMinOut', async () => {
    const { run, swapQueue, jobs } = make(swap({ amount: '5000', maxSlippagePct: 100 }));
    await run();
    expect(swapQueue.enqueueExisting.mock.calls[0]![2]).toMatchObject({ amountIn: 5_000_000_000n, minAmountOut: 0n, recipient: SAFE });
    expect(jobs.attachAgentPlan.mock.calls[0]![1].flags).toEqual(['drains-vault', 'over-cap', 'any-slippage']);
  });

  it('a normal trade inside the policy still goes through the dryRun audit (it ends held, never sent)', async () => {
    const { run, swapQueue, jobs } = make(swap());
    await run();
    expect(jobs.attachAgentPlan.mock.calls[0]![1].flags).toEqual([]);
    expect(swapQueue.enqueueExisting.mock.calls[0]![3]).toEqual({ dryRun: true, untrustedText: 'poisoned text', agentAction: 'swap 10 USDC for WAVAX' });
  });

  it('tells the brain what the vault holds and the price', async () => {
    const { run, brain } = make(swap());
    await run();
    expect(brain.plan).toHaveBeenCalledWith('poisoned text', { usdc: '3,000', wavax: '10', price: '1 WAVAX ~ 20 USDC' }, SAFE);
  });
});

describe('HijackService: on-chain plans are sent only if the chain refuses them', () => {
  it('unlimited approval: the dry run reverts (GS104), so it is sent with manual gas for Snowtrace evidence', async () => {
    const callRaw = vi.fn().mockResolvedValue({ reverted: true, revertReason: 'GS104' });
    const sendRaw = vi.fn().mockResolvedValue({ txHash: TX, status: 'reverted', blockNumber: 101n, revertReason: 'GS104' });
    const { run, jobs } = make({ type: 'approve', token: 'USDC', spender: HIJACK_STRANGER, amount: 'unlimited' }, { callRaw, sendRaw });
    await expect(run()).resolves.toBe('reverted');

    const call = sendRaw.mock.calls[0]![0];
    expect(callRaw.mock.calls[0]![0]).toEqual(call);
    expect(call.to).toBe(SAFE);
    const outer = decodeFunctionData({ abi: SAFE_MODULE_ABI, data: call.data });
    expect(decodeFunctionData({ abi: ERC20_ABI, data: outer.args[2]! }).args).toEqual([HIJACK_STRANGER, maxUint256]);
    expect(jobs.attachAgentPlan.mock.calls[0]![1].flags).toEqual(['approve-stranger', 'unlimited-approval']);
    expect(jobs.transition).toHaveBeenNthCalledWith(1, JOB, 'broadcasting');
    expect(jobs.transition).toHaveBeenLastCalledWith(JOB, 'reverted', { txHash: TX, reasonCode: 'GS104' });
    expect(jobs.recordShield).toHaveBeenCalledWith(JOB, 'onchain', 'fail', 'GS104', expect.any(Array));
  });

  it('direct over the cap: Shield 2 refuses the dry run, the mined revert is the evidence', async () => {
    const { run, sender } = make({ type: 'direct', tokenIn: 'USDC', tokenOut: 'WAVAX', amount: '2000' });
    await expect(run()).resolves.toBe('reverted');
    const call = sender.sendRaw.mock.calls[0]![0];
    expect(call.to).toBe(MODULE);
    const { functionName, args } = decodeFunctionData({ abi: POLICY_MODULE_ABI, data: call.data });
    expect(functionName).toBe('executeGuardedSwap');
    expect(args.slice(0, 3)).toEqual([USDC, WAVAX, 2_000_000_000n]);
  });

  it('direct inside the policy: the chain would accept it, so it is held and NOT sent', async () => {
    const callRaw = vi.fn().mockResolvedValue({ reverted: false });
    const { run, jobs, sender } = make({ type: 'direct', tokenIn: 'USDC', tokenOut: 'WAVAX', amount: '10' }, { callRaw });
    await expect(run()).resolves.toBe('held');
    expect(sender.sendRaw).not.toHaveBeenCalled();
    expect(jobs.transition).toHaveBeenCalledTimes(1);
    expect(jobs.transition).toHaveBeenCalledWith(JOB, 'held');
    expect(jobs.recordShield).toHaveBeenCalledWith(JOB, 'onchain', 'pass', null, expect.any(Array));
  });

  it('a dry run that cannot be judged (RPC down) fails the job and sends nothing', async () => {
    const callRaw = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const { run, jobs, sender } = make({ type: 'direct', tokenIn: 'USDC', tokenOut: 'WAVAX', amount: '2000' }, { callRaw });
    await expect(run()).resolves.toBe('failed');
    expect(sender.sendRaw).not.toHaveBeenCalled();
    expect(jobs.transition).toHaveBeenLastCalledWith(JOB, 'failed');
  });

  it('a revert that turns into a success on-chain is reported as a security alarm, never hidden', async () => {
    const sendRaw = vi.fn().mockResolvedValue({ txHash: TX, status: 'success', blockNumber: 101n, transfers: [] });
    const { run, jobs } = make({ type: 'direct', tokenIn: 'USDC', tokenOut: 'WAVAX', amount: '2000' }, { sendRaw });
    await expect(run()).resolves.toBe('confirmed');
    expect(jobs.transition).toHaveBeenLastCalledWith(JOB, 'confirmed', { txHash: TX });
  });
});

describe('HijackService: other outcomes', () => {
  it('no action: held, nothing queued or sent', async () => {
    const { run, jobs, swapQueue, sender } = make({ type: 'none' });
    await expect(run()).resolves.toBe('held');
    expect(jobs.attachAgentPlan).toHaveBeenCalledOnce();
    expect(jobs.transition).toHaveBeenCalledWith(JOB, 'held');
    expect(swapQueue.enqueueExisting).not.toHaveBeenCalled();
    expect(sender.callRaw).not.toHaveBeenCalled();
  });

  it('an unknown vault fails the job before the brain runs', async () => {
    const { run, jobs, brain } = make(swap(), { resolve: null });
    await expect(run()).resolves.toBe('failed');
    expect(brain.plan).not.toHaveBeenCalled();
    expect(jobs.transition).toHaveBeenCalledWith(JOB, 'failed', { reasonCode: 'VAULT_NOT_FOUND' });
  });

  it('an RPC failure while reading the vault fails the job, never throws', async () => {
    const h = make(swap());
    h.policy.readVaultState.mockRejectedValueOnce(new Error('rpc down'));
    await expect(h.run()).resolves.toBe('failed');
    expect(h.jobs.transition).toHaveBeenLastCalledWith(JOB, 'failed');
  });
});

describe('HijackService: no brain output can make it broadcast something the chain accepts', () => {
  // The brain is attacker-controlled. Whatever it plans, a signed transaction may only leave when the dry run
  // said the chain refuses it, and the swap path is never signed here at all.
  const plans: AgentAction[] = [
    swap({ amount: 'all', recipient: OTHER, maxSlippagePct: 100 }),
    swap({ amount: '999999999999', tokenIn: 'WAVAX', tokenOut: 'USDC' }),
    swap({ amount: '0.000001' }),
    { type: 'direct', tokenIn: 'USDC', tokenOut: 'WAVAX', amount: 'all' },
    { type: 'direct', tokenIn: 'WAVAX', tokenOut: 'USDC', amount: '1' },
    { type: 'direct', tokenIn: 'USDC', tokenOut: 'WAVAX', amount: '0.5' },
    { type: 'approve', token: 'WAVAX', spender: OTHER, amount: '1' },
    { type: 'approve', token: 'USDC', spender: ROUTER, amount: 'unlimited' },
    { type: 'none' },
  ];

  for (const verdict of [{ reverted: false }, { reverted: true, revertReason: 'ExceedsPerTxCap' }] as const) {
    it.each(plans)(`chain ${verdict.reverted ? 'refuses' : 'accepts'}: %j`, async (action) => {
      const callRaw = vi.fn().mockResolvedValue(verdict);
      const { run, sender, swapQueue } = make(action, { callRaw });
      await run();
      expect(sender.sendSwap).not.toHaveBeenCalled();
      if (!verdict.reverted) expect(sender.sendRaw).not.toHaveBeenCalled();
      if (sender.sendRaw.mock.calls.length > 0) expect(callRaw).toHaveBeenCalledWith(sender.sendRaw.mock.calls[0]![0]);
      for (const c of swapQueue.enqueueExisting.mock.calls) expect(c[3]).toMatchObject({ dryRun: true });
    });
  }
});
