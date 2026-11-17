import { encodeFunctionData, getAddress, parseAbi, parseEventLogs, zeroAddress, type Address, type Hex, type Log } from "viem";
import { approvedHashSignature } from "./funds";
import type { PolicyInput } from "./policy";
import { sameAddress } from "./address";

/**
 * Pure builders for the vault wizard (L9): the same four steps as packages/contracts/script/CreateVault.s.sol, but
 * signed in the owner's browser wallet. Nothing here reads the chain or holds a key.
 */

/** Safe v1.4.1 on Fuji (Safe's official deployments; mirrored from packages/contracts/script/lib/External.sol). */
export const SAFE_FUJI = {
  singletonL2: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
  proxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  fallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
} as const satisfies Record<string, Address>;

export const safeProxyFactoryAbi = parseAbi([
  "function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "event ProxyCreation(address indexed proxy, address singleton)",
]);

/** The Safe calls the wizard needs beyond the fund moves (funds.ts safeAbi). */
export const safeSetupAbi = parseAbi([
  "function setup(address[] owners, uint256 threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
  "function enableModule(address module)",
  "function isModuleEnabled(address module) view returns (bool)",
]);

/** `Safe.setup` for a 1-of-1 Safe owned by `owner`: no setup call, no payment, Safe's standard fallback handler. */
export function safeInitializer(owner: Address): Hex {
  return encodeFunctionData({
    abi: safeSetupAbi,
    functionName: "setup",
    args: [[owner], 1n, zeroAddress, "0x", SAFE_FUJI.fallbackHandler, zeroAddress, 0n, zeroAddress],
  });
}

/** A fresh salt per attempt, so a second vault from the same wallet gets its own address. */
export function newSaltNonce(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): bigint {
  const bytes = random(new Uint8Array(8));
  return bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
}

/** Arguments of SafeProxyFactory.createProxyWithNonce (CreateVault.s.sol `_createSafe`). */
export const createSafeArgs = (owner: Address, saltNonce: bigint) => [SAFE_FUJI.singletonL2, safeInitializer(owner), saltNonce] as const;

/** The new Safe's address from its creation receipt: the ProxyCreation event of the official factory. */
export function safeFromLogs(logs: readonly Log[]): Address | null {
  const events = parseEventLogs({ abi: safeProxyFactoryAbi, eventName: "ProxyCreation", logs: logs as Log[] });
  const hit = events.find((e) => sameAddress(e.address, SAFE_FUJI.proxyFactory) && sameAddress(e.args.singleton, SAFE_FUJI.singletonL2));
  return hit ? getAddress(hit.args.proxy) : null;
}

/**
 * Safe.execTransaction(self, enableModule(module)) signed by its 1-of-1 owner with an approved-hash signature (the
 * owner sending the transaction is the signature). Plain CALL, no refund: exactly CreateVault.s.sol `_enableModule`.
 */
export function enableModuleArgs(safe: Address, module: Address, owner: Address) {
  const data = encodeFunctionData({ abi: safeSetupAbi, functionName: "enableModule", args: [module] });
  return [safe, 0n, data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, approvedHashSignature(owner)] as const;
}

/** Who trades for the vault and through which DEX: fixed by our deployment, never typed by the user. */
export interface WizardAgent {
  agent: Address;
  router: Address;
  usdc: Address;
  wavax: Address;
}

/**
 * The first setPolicy of a new vault. Unlike buildSetPolicyArgs (L7), which keeps the agent and router the chain
 * already holds, a fresh module has none yet: they come from the deployment. Mirrors the contract's own checks.
 */
export function initialPolicyArgs(input: PolicyInput, a: WizardAgent, owner: Address) {
  if (sameAddress(a.agent, zeroAddress) || sameAddress(a.router, zeroAddress)) throw new Error("InvalidPolicy");
  // The agent key lives on our server; it must never be the wallet that can change the policy.
  if (sameAddress(a.agent, owner)) throw new Error("The agent cannot be the owner wallet.");
  const limits = [
    { maxPerTx: input.usdcMaxPerTx, dailyCap: input.usdcDailyCap },
    { maxPerTx: input.wavaxMaxPerTx, dailyCap: input.wavaxDailyCap },
  ];
  for (const l of limits) {
    if (l.maxPerTx <= 0n || l.dailyCap <= 0n || l.maxPerTx > l.dailyCap) throw new Error("InvalidPolicy");
  }
  return [{ agentSigner: a.agent, router: a.router, expiry: BigInt(input.expiry), isActive: true }, [a.usdc, a.wavax], limits] as const;
}

/** Same defaults as the demo vaults (CreateVault.s.sol, D15): 500 / 1,500 USDC, 20 / 60 WAVAX, 30 days. */
export const DEFAULT_POLICY_VALUES = {
  usdcMaxPerTx: "500",
  usdcDailyCap: "1500",
  wavaxMaxPerTx: "20",
  wavaxDailyCap: "60",
  expiryDays: 30,
};

/** Everything the chain says about the Safe being set up. Read fresh on every visit; never stored (P1). */
export interface WizardChainFacts {
  /** A contract answers getOwners() at this address. */
  safeExists: boolean;
  owners: readonly Address[];
  threshold: bigint | null;
  /** factory.moduleOf(safe); null = not deployed yet. */
  module: Address | null;
  moduleOwner: Address | null;
  moduleEnabled: boolean;
  agentSigner: Address | null;
  expiry: number;
  isActive: boolean;
  balances: { usdc: bigint; wavax: bigint };
}

/** "Policy active" the way the agent sees it: an agent is named, the policy is on, and it has not expired. */
export const policyIsLive = (f: Pick<WizardChainFacts, "agentSigner" | "isActive" | "expiry">, nowSec: number): boolean =>
  !!f.agentSigner && !sameAddress(f.agentSigner, zeroAddress) && f.isActive && f.expiry > nowSec;

/** The four facts the wizard guard (guards/wizard.ts) walks through. */
export function guardFacts(f: WizardChainFacts, nowSec: number) {
  return {
    owners: f.owners,
    moduleEnabled: f.moduleEnabled,
    policyActive: policyIsLive(f, nowSec),
    funded: f.balances.usdc > 0n || f.balances.wavax > 0n,
  };
}

/**
 * Why the connected wallet cannot finish this Safe here, or null. English, shown in the step. The wizard only
 * handles a 1-of-1 Safe owned by the signer, with a module the signer owns (the factory makes the caller its owner).
 */
export function wizardBlocker(f: WizardChainFacts | null, signer: Address | null): string | null {
  if (!f || !f.safeExists) return null;
  if (!signer) return "Connect the wallet that owns this Safe.";
  if (!f.owners.some((o) => sameAddress(o, signer))) return "The connected wallet is not an owner of this Safe. Switch wallets or start a new vault.";
  if (f.threshold !== null && f.threshold !== 1n) return `This Safe needs ${f.threshold} owner signatures. The wizard supports single-owner Safes; start a new vault instead.`;
  if (f.moduleOwner && !sameAddress(f.moduleOwner, signer)) return "Another owner of this Safe created its guard module, so only that wallet can enable it and set the policy.";
  return null;
}

/**
 * Wallet confirmations still ahead: Safe, module deploy, module enable, policy, one deposit. Faucet drips are
 * optional (the wallet may already hold test tokens), so they are not counted.
 */
export function confirmationsLeft(f: WizardChainFacts | null, nowSec: number): number {
  if (!f || !f.safeExists) return 5;
  const g = guardFacts(f, nowSec);
  return (f.module ? 0 : 1) + (f.moduleEnabled ? 0 : 1) + (g.policyActive ? 0 : 1) + (g.funded ? 0 : 1);
}

/** Wallet AVAX below this gets a warning before step 1: the whole wizard is ~6-8 transactions. */
export const WIZARD_MIN_GAS_WEI = 20_000_000_000_000_000n; // 0.02 AVAX (the fork test measures ~0.002 for all of it)
