// @vitest-environment node
/**
 * The owner's fund moves (L8) against the REAL deployed stage Safe (Safe v1.4.1, 1-of-1) and the real MockUSDC on an
 * Anvil fork of Fuji, through the web's own sendDeposit / sendFaucet / sendWithdraw and a wagmi mock connector that
 * impersonates the Safe owner. No real wallet, no real gas. Skipped unless FORK_RPC_URL is set:
 *
 *   anvil --fork-url <fuji rpc> --port 8546 --chain-id 43113
 *   FORK_RPC_URL=http://127.0.0.1:8546 pnpm --filter web exec vitest run --no-file-parallelism src/shared/web3/*.fork.test.ts
 *   (one file at a time: they share the fork, and snapshots / time jumps would cross)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, createTestClient, erc20Abi, getAddress, http, parseAbi, parseEther, type Address } from "viem";
import { avalancheFuji } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { faucetAbi, safeAbi } from "@/shared/lib/funds";

const FORK = process.env.FORK_RPC_URL ?? "";
const STRANGER = getAddress("0x00000000000000000000000000000000000beef2");
const deployments = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../../packages/contracts/deployments/fuji.json", import.meta.url)), "utf8")) as Record<string, string>;
const SAFE = getAddress(deployments.stageSafe!);
const MODULE = getAddress(deployments.stageModule!);
const USDC = getAddress(deployments.usdc!);

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
      connectors: [mock({ accounts: [owner.address] }), mock({ accounts: ["0x00000000000000000000000000000000000beef2"] })],
      transports: { [chain.id]: wagmiHttp(chain.rpcUrls.default.http[0]) },
    }),
  };
});

describe.runIf(FORK)("owner fund moves on a Fuji fork (real Safe + MockUSDC)", { timeout: 60_000 }, () => {
  const pub = createPublicClient({ chain: forkChain, transport: http(FORK) });
  const test = createTestClient({ chain: forkChain, mode: "anvil", transport: http(FORK) });
  let snapshot: `0x${string}`;
  const bal = (who: Address) => pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [who] });

  beforeAll(async () => {
    const [owners] = await Promise.all([pub.readContract({ address: SAFE, abi: safeAbi, functionName: "getOwners" })]);
    owner.address = owners[0]!;
    snapshot = await test.snapshot();
    for (const a of [owner.address, STRANGER]) {
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

  it("the stage Safe is 1-of-1, which is what a single-signature withdrawal needs", async () => {
    expect(await pub.readContract({ address: SAFE, abi: safeAbi, functionName: "getThreshold" })).toBe(1n);
  });

  it("faucet: the owner gets one drip of test USDC (after any cooldown)", async () => {
    const { sendFaucet } = await import("./fundsChain");
    await connectAs(0);
    const [last, cooldown, amount] = await Promise.all([
      pub.readContract({ address: USDC, abi: faucetAbi, functionName: "lastFaucetAt", args: [owner.address] }),
      pub.readContract({ address: USDC, abi: faucetAbi, functionName: "faucetCooldown" }),
      pub.readContract({ address: USDC, abi: faucetAbi, functionName: "faucetAmount" }),
    ]);
    if (last !== 0n) {
      await test.increaseTime({ seconds: Number(cooldown) + 1 });
      await test.mine({ blocks: 1 });
    }
    const before = await bal(owner.address);
    await (await sendFaucet(USDC)).wait();
    expect(await bal(owner.address)).toBe(before + amount);

    // A second drip right away is refused before the wallet opens.
    const { ChainRevert } = await import("./moduleChain");
    const err = await sendFaucet(USDC).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChainRevert);
    expect((err as InstanceType<typeof ChainRevert>).reason).toBe("FaucetCooldown");
  });

  it("deposit: owner -> Safe, exact amounts on both sides", async () => {
    const { sendDeposit } = await import("./fundsChain");
    await connectAs(0);
    const [o, s] = await Promise.all([bal(owner.address), bal(SAFE)]);
    await (await sendDeposit(USDC, SAFE, 10_000_000n)).wait();
    expect(await bal(owner.address)).toBe(o - 10_000_000n);
    expect(await bal(SAFE)).toBe(s + 10_000_000n);
  });

  it("withdraw: a Safe transaction the owner sends alone (approved-hash), funds land in the owner's wallet", async () => {
    const { sendWithdraw } = await import("./fundsChain");
    await connectAs(0);
    const [o, s] = await Promise.all([bal(owner.address), bal(SAFE)]);
    await (await sendWithdraw(SAFE, USDC, 5_000_000n)).wait();
    expect(await bal(owner.address)).toBe(o + 5_000_000n);
    expect(await bal(SAFE)).toBe(s - 5_000_000n);
    // The vault is still guarded afterwards.
    expect(await pub.readContract({ address: SAFE, abi: parseAbi(["function isModuleEnabled(address) view returns (bool)"]), functionName: "isModuleEnabled", args: [MODULE] })).toBe(true);
  });

  it("withdraw more than the Safe holds: refused by the Safe before the wallet opens (GS013)", async () => {
    const { sendWithdraw } = await import("./fundsChain");
    const { ChainRevert } = await import("./moduleChain");
    await connectAs(0);
    const err = await sendWithdraw(SAFE, USDC, (await bal(SAFE)) + 1n).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChainRevert);
    expect((err as InstanceType<typeof ChainRevert>).reason).toBe("GS013");
  });

  it("a stranger cannot withdraw: the Safe refuses its signature, nothing moves", async () => {
    const { sendWithdraw } = await import("./fundsChain");
    const { ChainRevert } = await import("./moduleChain");
    await connectAs(1);
    const s = await bal(SAFE);
    const err = await sendWithdraw(SAFE, USDC, 1_000_000n).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChainRevert);
    expect((err as InstanceType<typeof ChainRevert>).reason).toMatch(/^GS02[56]$/);
    expect(await bal(SAFE)).toBe(s);
    expect(await bal(STRANGER)).toBe(0n);
  });
});
