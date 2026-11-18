import { agentPolicyModuleAbi, agentShieldFactoryAbi } from "@agentshield/shared";
import { useMemo } from "react";
import { erc20Abi, getAddress, zeroAddress, type Address } from "viem";
import { useBalance, useReadContracts } from "wagmi";
import { getAccount, simulateContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { safeAbi } from "@/shared/lib/funds";
import type { PolicyInput } from "@/shared/lib/policy";
import { createSafeArgs, enableModuleArgs, initialPolicyArgs, safeFromLogs, safeProxyFactoryAbi, safeSetupAbi, SAFE_FUJI, type WizardAgent, type WizardChainFacts } from "@/shared/lib/wizard";
import type { SentTx } from "@/shared/ui/TxButton";
import { UserFacingError } from "@/shared/ui/txState";
import { FUJI, wagmiConfig } from "./config";
import { FUJI_DEPLOYMENT } from "./deployments";
import { ChainRevert, FACTORY_ADDRESS, revertReason, sendSimulated } from "./moduleChain";

/**
 * The vault wizard (L9) against Fuji: progress is read from the chain on every visit (P1) and each step is a
 * transaction the owner signs in the browser (P2). Our server is not involved until the vault exists.
 */

const POLL_MS = 4_000;

/** The shared AuraSentinel agent and the deployment's DEX and tokens: what a new vault's policy names. */
export const WIZARD_AGENT: WizardAgent = {
  agent: FUJI_DEPLOYMENT.agent,
  router: FUJI_DEPLOYMENT.router,
  usdc: FUJI_DEPLOYMENT.usdc,
  wavax: FUJI_DEPLOYMENT.wavax,
};

export interface WizardChainRead {
  facts: WizardChainFacts | null;
  status: "idle" | "loading" | "ready" | "unavailable";
  refetch: () => Promise<unknown>;
}

type Result<T> = { status: "success"; result: T } | { status: "failure"; error: Error };
const ok = <T>(r: Result<T> | undefined): T | undefined => (r?.status === "success" ? r.result : undefined);

/**
 * Safe owners and threshold, the module the factory made for it, and the Safe's token balances; then, once a module
 * exists, whether the Safe enabled it, who owns it and its policy. A Safe that does not exist yet reads as "nothing
 * done" (its calls fail one by one); only a failed request as a whole is "unavailable".
 */
export function useWizardChain(safe: Address | null): WizardChainRead {
  const address = safe ?? zeroAddress;
  const base = useReadContracts({
    allowFailure: true,
    contracts: [
      { chainId: FUJI.id, address, abi: safeAbi, functionName: "getOwners" },
      { chainId: FUJI.id, address, abi: safeAbi, functionName: "getThreshold" },
      { chainId: FUJI.id, address: FACTORY_ADDRESS ?? zeroAddress, abi: agentShieldFactoryAbi, functionName: "moduleOf", args: [address] },
      { chainId: FUJI.id, address: WIZARD_AGENT.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] },
      { chainId: FUJI.id, address: WIZARD_AGENT.wavax, abi: erc20Abi, functionName: "balanceOf", args: [address] },
    ],
    query: { enabled: !!safe && !!FACTORY_ADDRESS, refetchInterval: POLL_MS, retry: 2 },
  } as never) as { data?: Result<unknown>[]; isError: boolean; refetch: () => Promise<unknown> };

  const rawModule = ok(base.data?.[2] as Result<Address> | undefined);
  const module = rawModule && rawModule !== zeroAddress ? getAddress(rawModule) : null;
  const mod = useReadContracts({
    allowFailure: true,
    contracts: [
      { chainId: FUJI.id, address, abi: safeSetupAbi, functionName: "isModuleEnabled", args: [module ?? zeroAddress] },
      { chainId: FUJI.id, address: module ?? zeroAddress, abi: agentPolicyModuleAbi, functionName: "owner" },
      { chainId: FUJI.id, address: module ?? zeroAddress, abi: agentPolicyModuleAbi, functionName: "policy" },
    ],
    query: { enabled: !!module, refetchInterval: POLL_MS, retry: 2 },
  } as never) as { data?: Result<unknown>[]; isError: boolean; refetch: () => Promise<unknown> };

  const facts = useMemo<WizardChainFacts | null>(() => {
    if (!base.data || (module && !mod.data)) return null;
    const owners = ok(base.data[0] as Result<readonly Address[]>);
    const policy = ok(mod.data?.[2] as Result<readonly [Address, Address, bigint, boolean]> | undefined);
    const moduleOwner = ok(mod.data?.[1] as Result<Address> | undefined);
    return {
      safeExists: owners !== undefined,
      owners: owners ?? [],
      threshold: ok(base.data[1] as Result<bigint>) ?? null,
      module,
      moduleOwner: moduleOwner ? getAddress(moduleOwner) : null,
      moduleEnabled: ok(mod.data?.[0] as Result<boolean> | undefined) ?? false,
      agentSigner: policy ? getAddress(policy[0]) : null,
      expiry: policy ? Number(policy[2]) : 0,
      isActive: policy ? policy[3] : false,
      balances: { usdc: ok(base.data[3] as Result<bigint>) ?? 0n, wavax: ok(base.data[4] as Result<bigint>) ?? 0n },
    };
  }, [base.data, mod.data, module]);

  const { refetch: refetchBase } = base;
  const { refetch: refetchMod } = mod;
  const refetch = useMemo(() => () => Promise.all([refetchBase(), refetchMod()]), [refetchBase, refetchMod]);
  const status = !safe ? "idle" : facts ? "ready" : base.isError || mod.isError ? "unavailable" : "loading";
  return { facts, status, refetch };
}

/** The connected wallet's AVAX, for the gas warning before step 1. null while unknown. */
export function useWalletGas(wallet: Address | null): bigint | null {
  const q = useBalance({ chainId: FUJI.id, address: wallet ?? undefined, query: { enabled: !!wallet, refetchInterval: 10_000 } });
  return q.data?.value ?? null;
}

/** A sent Safe creation: the address is known before mining (CREATE2), and confirmed from the receipt's event. */
export interface SentSafe extends SentTx {
  safe: Address;
}

/**
 * Step 1: a new Safe v1.4.1, 1-of-1, owned by the signing wallet. The dry run returns the CREATE2 address, so the
 * wizard can remember it before the receipt; the receipt's ProxyCreation event must agree.
 */
export async function sendCreateSafe(saltNonce: bigint): Promise<SentSafe> {
  const account = getAccount(wagmiConfig);
  if (!account.address) throw new Error("Connect your wallet first.");
  if (account.chainId !== FUJI.id) await switchChain(wagmiConfig, { chainId: FUJI.id });
  const owner = account.address;
  let sim: { request: unknown; result: Address };
  try {
    sim = (await simulateContract(wagmiConfig, {
      chainId: FUJI.id,
      account: owner,
      address: SAFE_FUJI.proxyFactory,
      abi: safeProxyFactoryAbi,
      functionName: "createProxyWithNonce",
      args: createSafeArgs(owner, saltNonce),
    })) as { request: unknown; result: Address };
  } catch (err) {
    const reason = revertReason(err);
    throw reason ? new ChainRevert(reason) : err;
  }
  const hash = await writeContract(wagmiConfig, sim.request as never);
  const predicted = getAddress(sim.result);
  return {
    hash,
    safe: predicted,
    wait: async () => {
      const receipt = await waitForTransactionReceipt(wagmiConfig, { chainId: FUJI.id, hash });
      if (receipt.status !== "success") throw new ChainRevert("UNKNOWN_REVERT");
      const created = safeFromLogs(receipt.logs);
      if (!created || created !== predicted) throw new UserFacingError("The Safe was created at an unexpected address. Reload the page.");
    },
  };
}

/** Step 2a: AgentShieldFactory.deployModule(safe). The caller must own the Safe and becomes the module owner. */
export const sendDeployModule = (safe: Address): Promise<SentTx> => {
  if (!FACTORY_ADDRESS) return Promise.reject(new UserFacingError("The AuraSentinel factory is not configured for this build."));
  const factory = FACTORY_ADDRESS;
  return sendSimulated((account) =>
    simulateContract(wagmiConfig, { chainId: FUJI.id, account, address: factory, abi: agentShieldFactoryAbi, functionName: "deployModule", args: [safe] }),
  );
};

/** Step 2b: the Safe enables its module, a Safe transaction its 1-of-1 owner sends alone. */
export const sendEnableModule = (safe: Address, module: Address): Promise<SentTx> =>
  sendSimulated((account) =>
    simulateContract(wagmiConfig, { chainId: FUJI.id, account, address: safe, abi: safeAbi, functionName: "execTransaction", args: enableModuleArgs(safe, module, account) }),
  );

/** Step 3: the first policy, naming the AuraSentinel agent and the deployment's router and tokens. */
export const sendInitialPolicy = (module: Address, input: PolicyInput, agent: WizardAgent = WIZARD_AGENT): Promise<SentTx> =>
  sendSimulated((account) =>
    simulateContract(wagmiConfig, { chainId: FUJI.id, account, address: module, abi: agentPolicyModuleAbi, functionName: "setPolicy", args: initialPolicyArgs(input, agent, account) }),
  );
