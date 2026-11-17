import { agentPolicyModuleAbi, agentShieldFactoryAbi, type Address } from "@agentshield/shared";
import { useMemo } from "react";
import { BaseError, ContractFunctionRevertedError, getAddress, zeroAddress } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { getAccount, simulateContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { parseAddressEnv } from "@/shared/api/dataSource";
import type { ModuleChainState } from "@/shared/lib/policy";
import type { SentTx } from "@/shared/ui/TxButton";
import { FUJI, wagmiConfig } from "./config";

/**
 * Owner actions straight against the chain (invariant P2): reads come from the module itself and every write is
 * signed in the owner's wallet. Nothing here talks to our server, so the Kill-Switch keeps working with it off.
 */

/** AgentShieldFactory on Fuji (public address, packages/contracts/deployments/fuji.json). Finds a module without the API. */
export const FACTORY_ADDRESS: Address | null = parseAddressEnv(import.meta.env.VITE_FACTORY_ADDRESS);

/** How often the module is re-read while a page is open; Avalanche blocks are ~2 s. */
const CHAIN_POLL_MS = 4_000;

export interface ModuleChainRead {
  data: ModuleChainState | null;
  status: "loading" | "ready" | "unavailable";
  refetch: () => Promise<unknown>;
}

/** owner(), policy() and policyEpoch() of one module, read from the chain (P1). */
export function useModuleChain(module: Address | null): ModuleChainRead {
  const enabled = !!module;
  const address = module ?? zeroAddress;
  const q = useReadContracts({
    allowFailure: false,
    contracts: [
      { chainId: FUJI.id, address, abi: agentPolicyModuleAbi, functionName: "owner" },
      { chainId: FUJI.id, address, abi: agentPolicyModuleAbi, functionName: "policy" },
      { chainId: FUJI.id, address, abi: agentPolicyModuleAbi, functionName: "policyEpoch" },
    ],
    query: { enabled, refetchInterval: CHAIN_POLL_MS, retry: 2 },
  });
  // q.data keeps its identity while the chain answers the same (structural sharing), so this stays stable too.
  const data = useMemo<ModuleChainState | null>(() => {
    if (!q.data) return null;
    const [owner, [agentSigner, router, expiry, isActive], epoch] = q.data;
    return { owner, policy: { agentSigner, router, expiry: Number(expiry), isActive }, epoch };
  }, [q.data]);
  return { data, status: data ? "ready" : q.isError ? "unavailable" : "loading", refetch: q.refetch };
}

/** factory.moduleOf(safe): the module of a vault, straight from the chain. null = none, or the factory is not configured. */
export function useModuleOf(safe: Address | null): { module: Address | null; status: "loading" | "ready" | "unavailable" } {
  const q = useReadContract({
    chainId: FUJI.id,
    address: FACTORY_ADDRESS ?? zeroAddress,
    abi: agentShieldFactoryAbi,
    functionName: "moduleOf",
    args: [safe ?? zeroAddress],
    query: { enabled: !!safe && !!FACTORY_ADDRESS, retry: 2 },
  });
  if (!FACTORY_ADDRESS) return { module: null, status: "unavailable" };
  const module = q.data && q.data !== zeroAddress ? getAddress(q.data) : null;
  return { module, status: q.data !== undefined ? "ready" : q.isError ? "unavailable" : "loading" };
}

/** The wallet that would sign right now (wagmi), not the SIWE snapshot: only this one can send. */
export const useSigner = (): Address | null => useAccount().address ?? null;

/** A revert carries the custom error name (NotOwner, InvalidPolicy, ...). The UI maps it to English copy. */
export class ChainRevert extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ChainRevert";
  }
}

/** Custom error name inside a viem error, if the chain reverted with one. */
export function revertReason(err: unknown): string | null {
  if (!(err instanceof BaseError)) return null;
  const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError ? (reverted.data?.errorName ?? reverted.signature ?? "UNKNOWN_REVERT") : null;
}

type ModuleWrite =
  | { functionName: "revoke"; args?: undefined }
  | { functionName: "setPolicy"; args: readonly [{ agentSigner: Address; router: Address; expiry: bigint; isActive: boolean }, readonly Address[], readonly { maxPerTx: bigint; dailyCap: bigint }[]] };

/**
 * Sign and send one owner call: wallet on Fuji -> dry run (a revert shows its reason before any gas is spent) ->
 * the wallet popup -> wait for the receipt. Resolves with the hash as soon as it is signed, like every SentTx.
 */
export async function sendModuleTx(module: Address, call: ModuleWrite): Promise<SentTx> {
  const account = getAccount(wagmiConfig);
  if (!account.address) throw new Error("Connect your wallet first.");
  if (account.chainId !== FUJI.id) await switchChain(wagmiConfig, { chainId: FUJI.id });

  const base = { chainId: FUJI.id, address: module, abi: agentPolicyModuleAbi, account: account.address } as const;
  // Dry run first: a revert shows its reason (NotOwner, InvalidPolicy) before the wallet opens or gas is spent.
  const dryRun = async <T,>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      const reason = revertReason(err);
      throw reason ? new ChainRevert(reason) : err;
    }
  };
  const hash =
    call.functionName === "revoke"
      ? await writeContract(wagmiConfig, (await dryRun(() => simulateContract(wagmiConfig, { ...base, functionName: "revoke" }))).request)
      : await writeContract(wagmiConfig, (await dryRun(() => simulateContract(wagmiConfig, { ...base, functionName: "setPolicy", args: call.args }))).request);
  return {
    hash,
    wait: async () => {
      const receipt = await waitForTransactionReceipt(wagmiConfig, { chainId: FUJI.id, hash });
      if (receipt.status !== "success") throw new ChainRevert("UNKNOWN_REVERT");
    },
  };
}
