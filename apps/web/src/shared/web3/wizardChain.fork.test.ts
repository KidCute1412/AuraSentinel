// @vitest-environment node
/**
 * The whole vault wizard (L9) on an Anvil fork of Fuji, from a wallet that has never touched AgentShield, through the
 * web's own send functions and a wagmi mock connector: the real Safe v1.4.1 factory, the real AgentShieldFactory,
 * MockUSDC's faucet, and at the end the real agent address swapping through the new module. No real wallet, no real
 * gas. Skipped unless FORK_RPC_URL is set:
 *
 *   anvil --fork-url <fuji rpc> --port 8546 --chain-id 43113
 *   FORK_RPC_URL=http://127.0.0.1:8546 pnpm --filter web exec vitest run --no-file-parallelism src/shared/web3/*.fork.test.ts
 */
import { agentPolicyModuleAbi, agentShieldFactoryAbi } from "@agentshield/shared";
import { createPublicClient, createTestClient, erc20Abi, formatEther, getAddress, http, parseEther, type Address, type Hash } from "viem";
import { avalancheFuji } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { safeAbi } from "@/shared/lib/funds";
import { safeSetupAbi } from "@/shared/lib/wizard";
import { FUJI_DEPLOYMENT } from "./deployments";

const FORK = process.env.FORK_RPC_URL ?? "";
/** A brand-new owner, and a stranger who must not be able to take over its Safe. */
const FRESH = getAddress("0x00000000000000000000000000000000000beef3");
const STRANGER = getAddress("0x00000000000000000000000000000000000beef4");
const { factory: FACTORY, usdc: USDC, wavax: WAVAX, agent: AGENT } = FUJI_DEPLOYMENT;

const forkChain = { ...avalancheFuji, rpcUrls: { default: { http: [FORK || "http://127.0.0.1:1"] } } };

vi.mock("./config", async () => {
  const { createConfig, http: wagmiHttp } = await import("wagmi");
  const { mock } = await import("wagmi/connectors");
  const chain = { ...(await import("viem/chains")).avalancheFuji, rpcUrls: { default: { http: [process.env.FORK_RPC_URL ?? "http://127.0.0.1:1"] } } };
  return {
    FUJI: chain,
    APP_NAME: "AgentShield",
    hasWalletConnect: false,
    wagmiConfig: createConfig({
      chains: [chain],
      connectors: [mock({ accounts: ["0x00000000000000000000000000000000000beef3"] }), mock({ accounts: ["0x00000000000000000000000000000000000beef4"] })],
      transports: { [chain.id]: wagmiHttp(chain.rpcUrls.default.http[0]) },
    }),
  };
});

describe.runIf(FORK)("vault wizard end to end on a Fuji fork (fresh wallet, real factories)", { timeout: 120_000 }, () => {
  const pub = createPublicClient({ chain: forkChain, transport: http(FORK) });
  const test = createTestClient({ chain: forkChain, mode: "anvil", transport: http(FORK) });
  let snapshot: `0x${string}`;
  let safe: Address;
  let module: Address;
  const hashes: Hash[] = [];

  beforeAll(async () => {
    snapshot = await test.snapshot();
    for (const a of [FRESH, STRANGER, AGENT]) {
      await test.impersonateAccount({ address: a });
      await test.setBalance({ address: a, value: parseEther("10") });
    }
  }, 60_000); // the fork fetches each new account from the upstream RPC
  afterAll(async () => {
    if (snapshot) await test.revert({ id: snapshot });
  });

  const connectAs = async (index: 0 | 1) => {
    const { connect, disconnect } = await import("wagmi/actions");
    const { wagmiConfig } = await import("./config");
    await disconnect(wagmiConfig).catch(() => undefined);
    await connect(wagmiConfig, { connector: wagmiConfig.connectors[index]! });
  };
  const revertOf = async (p: Promise<unknown>) => {
    const { ChainRevert } = await import("./moduleChain");
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChainRevert);
    return (err as InstanceType<typeof ChainRevert>).reason;
  };

  it("step 1: a new 1-of-1 Safe owned by the wallet, at the address known before mining", async () => {
    const { sendCreateSafe } = await import("./wizardChain");
    await connectAs(0);
    const tx = await sendCreateSafe(BigInt(Date.now()));
    await tx.wait(); // also checks the receipt's ProxyCreation event agrees with the predicted address
    hashes.push(tx.hash as Hash);
    safe = tx.safe;
    expect(await pub.readContract({ address: safe, abi: safeAbi, functionName: "getOwners" })).toEqual([FRESH]);
    expect(await pub.readContract({ address: safe, abi: safeAbi, functionName: "getThreshold" })).toBe(1n);
  });

  it("step 2a: only an owner of the Safe can deploy its module; the owner becomes the module owner", async () => {
    const { sendDeployModule } = await import("./wizardChain");
    await connectAs(1);
    expect(await revertOf(sendDeployModule(safe))).toBe("NotSafeOwner");

    await connectAs(0);
    const tx = await sendDeployModule(safe);
    await tx.wait();
    hashes.push(tx.hash as Hash);
    module = getAddress(await pub.readContract({ address: FACTORY, abi: agentShieldFactoryAbi, functionName: "moduleOf", args: [safe] }));
    expect(await pub.readContract({ address: module, abi: agentPolicyModuleAbi, functionName: "owner" })).toBe(FRESH);
    expect(await pub.readContract({ address: module, abi: agentPolicyModuleAbi, functionName: "safe" })).toBe(safe);

    // Resume after a reload: a second deploy is refused, the wizard reads moduleOf instead.
    expect(await revertOf(sendDeployModule(safe))).toBe("ModuleExists");
  });

  it("step 2b: a stranger cannot enable it; the owner does, in one transaction", async () => {
    const { sendEnableModule } = await import("./wizardChain");
    await connectAs(1);
    expect(await revertOf(sendEnableModule(safe, module))).toMatch(/^GS02[56]$/);

    await connectAs(0);
    const tx = await sendEnableModule(safe, module);
    await tx.wait();
    hashes.push(tx.hash as Hash);
    expect(await pub.readContract({ address: safe, abi: safeSetupAbi, functionName: "isModuleEnabled", args: [module] })).toBe(true);
  });

  it("step 3: the first policy names the AgentShield agent and router, only the owner can set it", async () => {
    const { sendInitialPolicy } = await import("./wizardChain");
    const input = { usdcMaxPerTx: 500_000_000n, usdcDailyCap: 1_500_000_000n, wavaxMaxPerTx: 20n * 10n ** 18n, wavaxDailyCap: 60n * 10n ** 18n, expiry: Math.floor(Date.now() / 1000) + 30 * 86_400 };
    await connectAs(1);
    expect(await revertOf(sendInitialPolicy(module, input))).toBe("NotOwner");

    await connectAs(0);
    const tx = await sendInitialPolicy(module, input);
    await tx.wait();
    hashes.push(tx.hash as Hash);
    const [agentSigner, router, , isActive] = await pub.readContract({ address: module, abi: agentPolicyModuleAbi, functionName: "policy" });
    expect([agentSigner, router, isActive]).toEqual([AGENT, FUJI_DEPLOYMENT.router, true]);
  });

  it("step 4: faucet then deposit, from the fresh wallet into its Safe", async () => {
    const { sendDeposit, sendFaucet } = await import("./fundsChain");
    await connectAs(0);
    for (const token of [USDC, WAVAX]) {
      const tx = await sendFaucet(token);
      await tx.wait();
      hashes.push(tx.hash as Hash);
    }
    const deposits: [Address, bigint][] = [
      [USDC, 1_000_000_000n],
      [WAVAX, 40n * 10n ** 18n],
    ];
    for (const [token, amount] of deposits) {
      const tx = await sendDeposit(token, safe, amount);
      await tx.wait();
      hashes.push(tx.hash as Hash);
      expect(await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [safe] })).toBe(amount);
    }
  });

  it("the new vault works: the real agent can swap inside the limits through the module, and not above them", async () => {
    const deadline = (await pub.getBlock()).timestamp + 600n;
    const swap = (amountIn: bigint) =>
      pub.simulateContract({ account: AGENT, address: module, abi: agentPolicyModuleAbi, functionName: "executeGuardedSwap", args: [USDC, WAVAX, amountIn, 1n, deadline] });
    await expect(swap(100_000_000n)).resolves.toBeDefined();
    await expect(swap(600_000_000n)).rejects.toThrow(/ExceedsPerTxCap/);
  });

  it("gas for the whole wizard stays well under the 0.02 AVAX the page asks for", async () => {
    let wei = 0n;
    for (const hash of hashes) {
      const r = await pub.getTransactionReceipt({ hash });
      wei += r.gasUsed * r.effectiveGasPrice;
    }
    console.info(`wizard: ${hashes.length} transactions, ${formatEther(wei)} AVAX at fork gas prices`);
    expect(hashes).toHaveLength(8);
    expect(wei).toBeLessThan(parseEther("0.02"));
  });
});
