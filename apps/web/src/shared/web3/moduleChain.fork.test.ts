// @vitest-environment node
/**
 * End-to-end owner flow against the REAL deployed AgentPolicyModule, on an Anvil fork of Fuji. Runs the web's own
 * sendModuleTx (dry run -> sign -> receipt) through a wagmi mock connector that impersonates the module owner, so no
 * real wallet or real gas is involved. Skipped unless FORK_RPC_URL is set:
 *
 *   anvil --fork-url <fuji rpc> --port 8546 --chain-id 43113
 *   FORK_RPC_URL=http://127.0.0.1:8546 pnpm --filter web exec vitest run --no-file-parallelism src/shared/web3/*.fork.test.ts
 *   (one file at a time: they share the fork, and snapshots / time jumps would cross)
 *
 * Uses the stage vault from packages/contracts/deployments/fuji.json (the fork is thrown away afterwards).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { agentPolicyModuleAbi, type Address } from "@agentshield/shared";
import { createPublicClient, createTestClient, getAddress, http, parseEther } from "viem";
import { avalancheFuji } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildSetPolicyArgs, type ModuleChainState } from "@/shared/lib/policy";

const FORK = process.env.FORK_RPC_URL ?? "";
const STRANGER = getAddress("0x00000000000000000000000000000000000beef1");

const deployments = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../../packages/contracts/deployments/fuji.json", import.meta.url)), "utf8")) as Record<string, string>;
const MODULE = getAddress(deployments.stageModule!);
const USDC = getAddress(deployments.usdc!);
const WAVAX = getAddress(deployments.wavax!);
const AGENT = getAddress(deployments.agent!);

// Fuji, but every RPC call (reads, the mock wallet's eth_sendTransaction) goes to the fork.
const forkChain = { ...avalancheFuji, rpcUrls: { default: { http: [FORK || "http://127.0.0.1:1"] } } };
const owner = vi.hoisted(() => ({ address: "0x0000000000000000000000000000000000000001" as `0x${string}` }));

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
      connectors: [mock({ accounts: [owner.address] }), mock({ accounts: ["0x00000000000000000000000000000000000beef1"] })],
      transports: { [chain.id]: wagmiHttp(chain.rpcUrls.default.http[0]) },
    }),
  };
});

// A fresh fork pulls state from Fuji on first touch: allow for a slow public RPC.
describe.runIf(FORK)("owner flow on a Fuji fork (real AgentPolicyModule bytecode)", { timeout: 60_000 }, () => {
  const pub = createPublicClient({ chain: forkChain, transport: http(FORK) });
  const test = createTestClient({ chain: forkChain, mode: "anvil", transport: http(FORK) });
  let ownerAddress: Address;
  let snapshot: `0x${string}`;

  const readModule = async (): Promise<ModuleChainState> => {
    const [agentSigner, router, expiry, isActive] = await pub.readContract({ address: MODULE, abi: agentPolicyModuleAbi, functionName: "policy" });
    const epoch = await pub.readContract({ address: MODULE, abi: agentPolicyModuleAbi, functionName: "policyEpoch" });
    return { owner: ownerAddress, policy: { agentSigner, router, expiry: Number(expiry), isActive }, epoch };
  };

  /** What the agent can do right now: dry-run one small guarded swap as the agent. */
  const agentSwapRevert = async (): Promise<string | null> => {
    const { revertReason } = await import("./moduleChain");
    const block = await pub.getBlock();
    try {
      await pub.simulateContract({
        address: MODULE,
        abi: agentPolicyModuleAbi,
        functionName: "executeGuardedSwap",
        args: [USDC, WAVAX, 1_000_000n, 1n, block.timestamp + 300n],
        account: AGENT,
      });
      return null;
    } catch (err) {
      return revertReason(err);
    }
  };

  beforeAll(async () => {
    ownerAddress = await pub.readContract({ address: MODULE, abi: agentPolicyModuleAbi, functionName: "owner" });
    owner.address = ownerAddress;
    snapshot = await test.snapshot();
    for (const a of [ownerAddress, STRANGER]) {
      await test.impersonateAccount({ address: a });
      await test.setBalance({ address: a, value: parseEther("10") });
    }
  });

  afterAll(async () => {
    if (snapshot) await test.revert({ id: snapshot });
  });

  const connectAs = async (index: 0 | 1) => {
    const { connect, disconnect } = await import("wagmi/actions");
    const { wagmiConfig } = await import("./config");
    await disconnect(wagmiConfig).catch(() => undefined);
    await connect(wagmiConfig, { connector: wagmiConfig.connectors[index]! });
  };

  it("starts with an active policy the agent can trade under", async () => {
    const m = await readModule();
    expect(m.policy.isActive).toBe(true);
    expect(await agentSwapRevert()).toBeNull();
  });

  it("refuses a stranger before any gas is spent (dry run says NotOwner)", async () => {
    const { sendModuleTx, ChainRevert } = await import("./moduleChain");
    await connectAs(1);
    const err = await sendModuleTx(MODULE, { functionName: "revoke" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChainRevert);
    expect((err as InstanceType<typeof ChainRevert>).reason).toBe("NotOwner");
    expect((await readModule()).policy.isActive).toBe(true);
  });

  it("Kill-Switch: the owner's revoke locks the agent out (PolicyInactive)", async () => {
    const { sendModuleTx } = await import("./moduleChain");
    await connectAs(0);
    const t0 = performance.now();
    const tx = await sendModuleTx(MODULE, { functionName: "revoke" });
    expect(tx.hash).toMatch(/^0x[0-9a-f]{64}$/);
    await tx.wait();
    console.info(`[fork] revoke confirmed in ${Math.round(performance.now() - t0)} ms (local fork, not Fuji finality)`);
    expect((await readModule()).policy.isActive).toBe(false);
    expect(await agentSwapRevert()).toBe("PolicyInactive");
  });

  it("Re-activate: setPolicy built by the form keeps agent + router, starts a new epoch, the agent trades again", async () => {
    const { sendModuleTx } = await import("./moduleChain");
    await connectAs(0);
    const before = await readModule();
    const now = Number((await pub.getBlock()).timestamp);
    const args = buildSetPolicyArgs(before, { usdc: USDC, wavax: WAVAX }, {
      usdcMaxPerTx: 400_000_000n,
      usdcDailyCap: 1_200_000_000n,
      wavaxMaxPerTx: 15n * 10n ** 18n,
      wavaxDailyCap: 45n * 10n ** 18n,
      expiry: now + 7 * 86_400,
    });
    const tx = await sendModuleTx(MODULE, { functionName: "setPolicy", args });
    await tx.wait();

    const after = await readModule();
    expect(after.policy).toEqual({ agentSigner: before.policy.agentSigner, router: before.policy.router, expiry: now + 7 * 86_400, isActive: true });
    expect(after.epoch).toBe(before.epoch + 1n);
    const usdc = await pub.readContract({ address: MODULE, abi: agentPolicyModuleAbi, functionName: "limits", args: [USDC] });
    expect(usdc).toEqual([400_000_000n, 1_200_000_000n]);
    expect(await agentSwapRevert()).toBeNull();
  });

  it("refuses limits the contract would reject, before the wallet opens", async () => {
    const { sendModuleTx, ChainRevert } = await import("./moduleChain");
    await connectAs(0);
    const m = await readModule();
    const [p, tokens, limits] = buildSetPolicyArgs(m, { usdc: USDC, wavax: WAVAX }, { usdcMaxPerTx: 1n, usdcDailyCap: 2n, wavaxMaxPerTx: 1n, wavaxDailyCap: 2n, expiry: Number((await pub.getBlock()).timestamp) + 60 });
    // Expiry in the past is the one InvalidPolicy the form cannot catch on its own (clock skew): the dry run does.
    const err = await sendModuleTx(MODULE, { functionName: "setPolicy", args: [{ ...p, expiry: 1n }, tokens, limits] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChainRevert);
    expect((err as InstanceType<typeof ChainRevert>).reason).toBe("InvalidPolicy");
  });
});
