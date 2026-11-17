// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, getAddress, zeroAddress, type Address, type Log } from "viem";
import { describe, expect, it } from "vitest";
import { approvedHashSignature } from "./funds";
import {
  confirmationsLeft,
  createSafeArgs,
  enableModuleArgs,
  guardFacts,
  initialPolicyArgs,
  newSaltNonce,
  policyIsLive,
  SAFE_FUJI,
  safeFromLogs,
  safeProxyFactoryAbi,
  safeSetupAbi,
  wizardBlocker,
  type WizardChainFacts,
} from "./wizard";

const OWNER = getAddress("0x12e341ef08abdef1f94a20ff38fa4ee2ef608199");
const OTHER = getAddress("0x8888888888888888888888888888888888888888");
const SAFE = getAddress("0xca435ab856eddd8c15b83d16672230b916737a8f");
const MODULE = getAddress("0xd7b3d84c9ff9370ac3f5715df36c0375dc7f7a99");
const AGENT = { agent: getAddress("0x9a478e17cfe33c98e5e74b4d744d249526c9be18"), router: getAddress("0xd7f655e3376ce2d7a2b08ff01eb3b1023191a901"), usdc: getAddress("0x99b583dc1f12668e1274261b952acd9398f3835f"), wavax: getAddress("0x88b55fbe883231e073a820061ede453d2843fcc1") };
const INPUT = { usdcMaxPerTx: 500_000_000n, usdcDailyCap: 1_500_000_000n, wavaxMaxPerTx: 20n * 10n ** 18n, wavaxDailyCap: 60n * 10n ** 18n, expiry: 2_000_000_000 };

describe("SAFE_FUJI", () => {
  it("matches the Safe v1.4.1 addresses the deploy scripts use (script/lib/External.sol)", () => {
    const sol = readFileSync(fileURLToPath(new URL("../../../../../packages/contracts/script/lib/External.sol", import.meta.url)), "utf8");
    const constant = (name: string) => getAddress(new RegExp(`${name}\\s*=\\s*(0x[0-9a-fA-F]{40})`).exec(sol)![1]!);
    expect(SAFE_FUJI.singletonL2).toBe(constant("SAFE_L2_SINGLETON"));
    expect(SAFE_FUJI.proxyFactory).toBe(constant("SAFE_PROXY_FACTORY"));
    expect(SAFE_FUJI.fallbackHandler).toBe(constant("SAFE_FALLBACK_HANDLER"));
  });
});

describe("createSafeArgs", () => {
  it("is a 1-of-1 Safe owned by the signer: no setup call, no payment, standard fallback handler", () => {
    const [singleton, initializer, salt] = createSafeArgs(OWNER, 42n);
    expect(singleton).toBe(SAFE_FUJI.singletonL2);
    expect(salt).toBe(42n);
    const { functionName, args } = decodeFunctionData({ abi: safeSetupAbi, data: initializer });
    expect(functionName).toBe("setup");
    expect(args).toEqual([[OWNER], 1n, zeroAddress, "0x", SAFE_FUJI.fallbackHandler, zeroAddress, 0n, zeroAddress]);
  });

  it("a fresh salt every time, from 8 random bytes", () => {
    expect(newSaltNonce(() => new Uint8Array([0, 0, 0, 0, 0, 0, 1, 2]))).toBe(258n);
    expect(newSaltNonce()).not.toBe(newSaltNonce());
  });
});

describe("safeFromLogs", () => {
  const log = (address: Address, proxy: Address, singleton: Address): Log =>
    ({
      address,
      topics: encodeEventTopics({ abi: safeProxyFactoryAbi, eventName: "ProxyCreation", args: { proxy } }),
      data: encodeAbiParameters([{ type: "address" }], [singleton]),
    }) as unknown as Log;

  it("reads the new Safe from the official factory's ProxyCreation event", () => {
    expect(safeFromLogs([log(SAFE_FUJI.proxyFactory, SAFE, SAFE_FUJI.singletonL2)])).toBe(SAFE);
  });

  it("ignores the same event from another contract or for another singleton", () => {
    expect(safeFromLogs([log(OTHER, SAFE, SAFE_FUJI.singletonL2)])).toBeNull();
    expect(safeFromLogs([log(SAFE_FUJI.proxyFactory, SAFE, OTHER)])).toBeNull();
    expect(safeFromLogs([])).toBeNull();
  });
});

describe("enableModuleArgs", () => {
  it("is the Safe calling enableModule on itself, a plain CALL with no refund, signed by its owner", () => {
    const [to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures] = enableModuleArgs(SAFE, MODULE, OWNER);
    expect(to).toBe(SAFE);
    expect(value).toBe(0n);
    expect(operation).toBe(0);
    expect([safeTxGas, baseGas, gasPrice]).toEqual([0n, 0n, 0n]);
    expect([gasToken, refundReceiver]).toEqual([zeroAddress, zeroAddress]);
    expect(decodeFunctionData({ abi: safeSetupAbi, data })).toEqual({ functionName: "enableModule", args: [MODULE] });
    expect(signatures).toBe(approvedHashSignature(OWNER));
  });
});

describe("initialPolicyArgs", () => {
  it("names the deployment's agent and router, both tokens, active, with the owner's limits and expiry", () => {
    const [policy, tokens, limits] = initialPolicyArgs(INPUT, AGENT, OWNER);
    expect(policy).toEqual({ agentSigner: AGENT.agent, router: AGENT.router, expiry: 2_000_000_000n, isActive: true });
    expect(tokens).toEqual([AGENT.usdc, AGENT.wavax]);
    expect(limits).toEqual([
      { maxPerTx: 500_000_000n, dailyCap: 1_500_000_000n },
      { maxPerTx: 20n * 10n ** 18n, dailyCap: 60n * 10n ** 18n },
    ]);
  });

  it("refuses what the module would refuse, and an agent that is the owner wallet", () => {
    expect(() => initialPolicyArgs({ ...INPUT, usdcMaxPerTx: 2_000_000_000n }, AGENT, OWNER)).toThrow("InvalidPolicy");
    expect(() => initialPolicyArgs({ ...INPUT, wavaxDailyCap: 0n }, AGENT, OWNER)).toThrow("InvalidPolicy");
    expect(() => initialPolicyArgs(INPUT, { ...AGENT, agent: zeroAddress }, OWNER)).toThrow("InvalidPolicy");
    expect(() => initialPolicyArgs(INPUT, AGENT, AGENT.agent)).toThrow(/cannot be the owner/);
  });
});

const facts = (over: Partial<WizardChainFacts> = {}): WizardChainFacts => ({
  safeExists: true,
  owners: [OWNER],
  threshold: 1n,
  module: MODULE,
  moduleOwner: OWNER,
  moduleEnabled: true,
  agentSigner: AGENT.agent,
  expiry: 2_000,
  isActive: true,
  balances: { usdc: 0n, wavax: 0n },
  ...over,
});

describe("guardFacts", () => {
  it("policy counts only when an agent is named, it is on and not expired", () => {
    expect(policyIsLive(facts(), 1_000)).toBe(true);
    expect(policyIsLive(facts({ isActive: false }), 1_000)).toBe(false);
    expect(policyIsLive(facts({ agentSigner: zeroAddress }), 1_000)).toBe(false);
    expect(policyIsLive(facts({ expiry: 1_000 }), 1_000)).toBe(false);
  });

  it("funded = either token above zero in the Safe", () => {
    expect(guardFacts(facts(), 1_000).funded).toBe(false);
    expect(guardFacts(facts({ balances: { usdc: 0n, wavax: 1n } }), 1_000).funded).toBe(true);
  });
});

describe("wizardBlocker", () => {
  it("nothing to say before a Safe exists, or for its 1-of-1 owner", () => {
    expect(wizardBlocker(null, OWNER)).toBeNull();
    expect(wizardBlocker(facts({ safeExists: false, owners: [] }), OWNER)).toBeNull();
    expect(wizardBlocker(facts(), OWNER)).toBeNull();
    expect(wizardBlocker(facts({ module: null, moduleOwner: null }), OWNER)).toBeNull();
  });

  it("explains every case the wizard cannot finish, in English", () => {
    expect(wizardBlocker(facts(), null)).toMatch(/Connect the wallet/);
    expect(wizardBlocker(facts(), OTHER)).toMatch(/not an owner/);
    expect(wizardBlocker(facts({ owners: [OWNER, OTHER], threshold: 2n }), OWNER)).toMatch(/needs 2 owner signatures/);
    expect(wizardBlocker(facts({ owners: [OWNER, OTHER], moduleOwner: OTHER }), OWNER)).toMatch(/Another owner/);
  });
});

describe("confirmationsLeft", () => {
  it("counts Safe, module deploy, module enable, policy and one deposit", () => {
    expect(confirmationsLeft(null, 1_000)).toBe(5);
    expect(confirmationsLeft(facts({ module: null, moduleOwner: null, moduleEnabled: false, isActive: false }), 1_000)).toBe(4);
    expect(confirmationsLeft(facts({ moduleEnabled: false, isActive: false }), 1_000)).toBe(3);
    expect(confirmationsLeft(facts(), 1_000)).toBe(1);
    expect(confirmationsLeft(facts({ balances: { usdc: 1n, wavax: 0n } }), 1_000)).toBe(0);
  });
});

