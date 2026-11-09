/**
 * A4 + A5 against a real Anvil node (no fork needed): deploys a test double of the policy module
 * with the same ABI (test/fixtures/contracts/MockPolicyModule.sol) and drives the real
 * ViemTxSender and AnvilSimulator through it.
 *
 * Skipped unless ANVIL_TEST_URL is set. Run with a throwaway node (it deploys contracts):
 *   docker run -d --rm --name as-anvil-test -p 127.0.0.1:18545:8545 --entrypoint anvil \
 *     ghcr.io/foundry-rs/foundry:stable --host 0.0.0.0 --port 8545 --chain-id 43113
 *   ANVIL_TEST_URL=http://127.0.0.1:18545 pnpm --filter server test test/integration
 */
import { createPublicClient, http, parseUnits, type Address, type Hex, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SwapIntent } from '../../src/core/types';
import { ViemTxSender } from '../../src/modules/execution/adapters/viem.tx-sender';
import { createAgentWallet } from '../../src/modules/execution/agent-wallet';
import { AnvilSimulator, createAnvilClient, type AnvilClient } from '../../src/modules/simulation/adapters/anvil.simulator';
import { MockPolicyModule, MockToken } from '../fixtures/contracts/mock-policy.artifacts';

const URL = process.env.ANVIL_TEST_URL;

// Anvil's well-known dev keys (public, test only). #0 deploys, #1 plays the agent session key.
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const AGENT_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const SAFE: Address = '0x1111111111111111111111111111111111111111';
const ROUTER: Address = '0x6666666666666666666666666666666666666666';
const ATTACKER: Address = '0x9999999999999999999999999999999999999999';
const USDC = (n: string) => parseUnits(n, 6);

describe.skipIf(!URL)('ViemTxSender + AnvilSimulator on Anvil', () => {
  let anvil: AnvilClient;
  let pub: PublicClient;
  let usdc: Address;
  let wavax: Address;
  let module: Address;
  let sender: ViemTxSender;
  let sim: AnvilSimulator;

  const intent = (amountIn: bigint, recipient: Address = SAFE): SwapIntent => ({
    tokenIn: usdc,
    tokenOut: wavax,
    amountIn,
    minAmountOut: parseUnits('2', 18),
    recipient,
    origin: 'rebalancer',
  });

  const deploy = async (abi: readonly unknown[], bytecode: Hex, args: unknown[] = []) => {
    const hash = await anvil.deployContract({
      abi: abi as never,
      bytecode,
      args: args as never,
      account: privateKeyToAccount(DEPLOYER_KEY),
      chain: avalancheFuji,
    });
    const r = await anvil.waitForTransactionReceipt({ hash, pollingInterval: 50 });
    return r.contractAddress as Address;
  };

  const balance = (token: Address, owner: Address) =>
    pub.readContract({ address: token, abi: MockToken.abi, functionName: 'balanceOf', args: [owner] });

  beforeAll(async () => {
    anvil = createAnvilClient(URL!);
    pub = createPublicClient({ chain: avalancheFuji, transport: http(URL) }) as PublicClient;
    const agent = privateKeyToAccount(AGENT_KEY).address;
    usdc = await deploy(MockToken.abi, MockToken.bytecode);
    wavax = await deploy(MockToken.abi, MockToken.bytecode);
    module = await deploy(MockPolicyModule.abi, MockPolicyModule.bytecode, [SAFE, agent, ROUTER, USDC('500')]);
    const mint = await anvil.writeContract({
      address: usdc,
      abi: MockToken.abi,
      functionName: 'mint',
      args: [SAFE, USDC('10000')],
      account: privateKeyToAccount(DEPLOYER_KEY),
      chain: avalancheFuji,
    });
    await anvil.waitForTransactionReceipt({ hash: mint, pollingInterval: 50 });

    sender = new ViemTxSender(createAgentWallet(AGENT_KEY, [URL!]), pub, { pollingIntervalMs: 50 });
    sim = new AnvilSimulator(anvil, { resetFork: false });
  }, 30_000);

  describe('A4: ViemTxSender', () => {
    it('runs two parallel sends one after the other, consecutive nonces, both mined', async () => {
      const [a, b] = await Promise.all([
        sender.sendSwap(intent(USDC('100')), { safe: SAFE, module }),
        sender.sendSwap(intent(USDC('200')), { safe: SAFE, module }),
      ]);
      expect([a.status, b.status]).toEqual(['success', 'success']);
      const [ta, tb] = await Promise.all([pub.getTransaction({ hash: a.txHash }), pub.getTransaction({ hash: b.txHash })]);
      expect(tb.nonce).toBe(ta.nonce + 1);
      expect(b.blockNumber).toBeGreaterThan(a.blockNumber);
    });

    it('mines a Shield 2 revert: hash on chain, status reverted, reason ExceedsPerTxCap', async () => {
      const before = await balance(usdc, SAFE);
      const r = await sender.sendSwap(intent(USDC('2000')), { safe: SAFE, module });
      expect(r.status).toBe('reverted');
      expect(r.revertReason).toBe('ExceedsPerTxCap');
      const receipt = await pub.getTransactionReceipt({ hash: r.txHash });
      expect(receipt.status).toBe('reverted');
      expect(await balance(usdc, SAFE)).toBe(before);
    });

    it('keeps the nonce chain intact after a revert', async () => {
      const r = await sender.sendSwap(intent(USDC('10')), { safe: SAFE, module });
      expect(r.status).toBe('success');
    });
  });

  describe('A5: AnvilSimulator', () => {
    it('valid swap: ok, exact deltas, no allowance left, nothing changed on the node', async () => {
      const before = await balance(usdc, SAFE);
      const t0 = performance.now();
      const r = await sim.simulate(intent(USDC('100')), { safe: SAFE, module, agent: sender.address });
      const ms = performance.now() - t0;
      expect(r).toEqual({
        ok: true,
        deltaSafeTokenIn: (-USDC('100')).toString(),
        deltaSafeTokenOut: parseUnits('2', 18).toString(),
        attackerBalance: '0',
        allowanceAfter: '0',
      });
      expect(ms).toBeLessThan(1000);
      expect(await balance(usdc, SAFE)).toBe(before); // snapshot reverted
    });

    it('over the per-tx cap: not ok, ExceedsPerTxCap, < 1 s', async () => {
      const t0 = performance.now();
      const r = await sim.simulate(intent(USDC('2000')), { safe: SAFE, module, agent: sender.address });
      expect(performance.now() - t0).toBeLessThan(1000);
      expect(r.ok).toBe(false);
      expect(r.revertReason).toBe('ExceedsPerTxCap');
    });

    it('impersonates policy.agentSigner when no agent is given', async () => {
      const r = await sim.simulate(intent(USDC('50')), { safe: SAFE, module });
      expect(r.ok).toBe(true);
    });

    it('a wrong signer is caught as UnauthorizedAgent', async () => {
      const r = await sim.simulate(intent(USDC('50')), { safe: SAFE, module, agent: ATTACKER });
      expect(r.revertReason).toBe('UnauthorizedAgent');
    });

    it('reports a leftover allowance so the post-sim invariant can block it', async () => {
      const set = (v: boolean) =>
        anvil
          .writeContract({
            address: module,
            abi: MockPolicyModule.abi,
            functionName: 'setLeaveAllowance',
            args: [v],
            account: privateKeyToAccount(DEPLOYER_KEY),
            chain: avalancheFuji,
          })
          .then((hash) => anvil.waitForTransactionReceipt({ hash, pollingInterval: 50 }));
      await set(true);
      try {
        const r = await sim.simulate(intent(USDC('100')), { safe: SAFE, module, agent: sender.address });
        expect(r.ok).toBe(true);
        expect(r.allowanceAfter).toBe('1');
      } finally {
        await set(false);
      }
    });

    it('watches a non-Safe recipient (attack #2 shape)', async () => {
      const r = await sim.simulate(intent(USDC('100'), ATTACKER), { safe: SAFE, module, agent: sender.address });
      expect(r.ok).toBe(true);
      expect(r.attackerBalance).toBe('0'); // the module hard-codes the Safe, the attacker gets nothing
    });
  });
});
