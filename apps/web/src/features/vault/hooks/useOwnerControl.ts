import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { Address, StateDto } from "@agentshield/shared";
import { isLive } from "@/shared/api/dataSource";
import { killTx, setPolicyTx } from "@/shared/api/mockChain";
import { queryKeys } from "@/shared/api/queryKeys";
import type { VaultView } from "@/shared/api/vaultSource";
import { sameAddress } from "@/shared/lib/address";
import { buildSetPolicyArgs, setPolicyBlocker, type ModuleChainState, type PolicyInput, type PolicyTokens } from "@/shared/lib/policy";
import type { SentTx } from "@/shared/ui/TxButton";
import { sendModuleTx, useModuleChain, useSigner } from "@/shared/web3/moduleChain";
import type { VaultRole } from "../guards/access";

/**
 * The owner's two wallet-signed powers over a vault: Kill-Switch (revoke) and setPolicy. Mock builds keep the
 * in-browser simulation; live builds read the module straight from the chain and sign in the wallet (P2), so the
 * controls never depend on our server.
 */
export interface OwnerControl {
  /** The connected wallet may sign owner actions on this vault right now. */
  canSign: boolean;
  /** Ownership is known (live: the module has been read). Before that, `canSign` is false but not a "no". */
  ready: boolean;
  /** Why the controls are off, for a visitor who should be told (English). null = nothing to say. */
  notice: string | null;
  /** Kill-Switch state as the chain says (live). null = unknown here: use the vault state instead. */
  isActive: boolean | null;
  /** The module as read from the chain (live only). */
  chain: ModuleChainState | null;
  revoke: () => Promise<SentTx>;
  setPolicy: (input: PolicyInput, tokens: PolicyTokens | null) => () => Promise<SentTx>;
  /** Why this setPolicy cannot be sent yet, or null. */
  policyBlocker: (input: PolicyInput, tokens: PolicyTokens | null, nowSec: number) => string | null;
}

export interface OwnerControlOptions {
  role: VaultRole;
  /** /demo: the public sandbox page. */
  sandbox?: boolean;
}

/** Simulation: the owner, or anyone on /demo (a shared sandbox owner "signs" for visitors). */
export function useMockOwnerControl(view: VaultView, { role, sandbox }: OwnerControlOptions): OwnerControl {
  return useMemo(
    () => ({
      canSign: !!sandbox || role === "owner",
      ready: true,
      notice: null,
      isActive: null,
      chain: null,
      revoke: killTx(view.safe),
      setPolicy: (input) => setPolicyTx(view.safe, input),
      policyBlocker: () => null,
    }),
    [view.safe, role, sandbox],
  );
}

/** Live: chain-read owner vs the wallet that would sign. Only `module.owner()` can pass the contract's onlyOwner. */
export function useLiveOwnerControl(view: VaultView, { sandbox }: OwnerControlOptions): OwnerControl {
  const qc = useQueryClient();
  const read = useModuleChain(view.module);
  const signer = useSigner();
  const chain = read.data;
  const { refetch } = read;
  const module = view.module;
  const canSign = !!chain && !!module && sameAddress(signer, chain.owner);

  const notice = canSign
    ? null
    : read.status === "unavailable"
      ? "Could not read this vault from the chain. Check your connection and reload."
      : read.status === "loading"
        ? null
        : sandbox
          ? "Only the vault owner can press this. On your own vault you sign it in your wallet."
          : !signer
            ? "Connect the owner wallet to use these controls."
            : "Only the vault owner can do this. The connected wallet is not the owner.";

  /** After a receipt: re-read the module, and refresh the server's snapshot if it is up (SSE does the same). */
  const settle = useCallback(
    (tx: SentTx, after: (s: StateDto) => StateDto): SentTx => ({
      hash: tx.hash,
      wait: async () => {
        await tx.wait();
        qc.setQueryData<StateDto>(queryKeys.vaultState(view.safe), (s) => (s ? after(s) : s));
        void qc.invalidateQueries({ queryKey: queryKeys.vaultState(view.safe) });
        void refetch();
      },
    }),
    [qc, view.safe, refetch],
  );

  return useMemo<OwnerControl>(() => {
    const requireModule = (): Address => {
      if (!module) throw new Error("This vault has no module yet.");
      return module;
    };
    return {
      canSign,
      ready: read.status !== "loading",
      notice,
      isActive: chain?.policy.isActive ?? null,
      chain,
      revoke: async () => settle(await sendModuleTx(requireModule(), { functionName: "revoke" }), (s) => ({ ...s, isActive: false })),
      setPolicy: (input, tokens) => async () => {
        if (!chain || !tokens) throw new Error("The vault is not ready to sign a policy yet.");
        const args = buildSetPolicyArgs(chain, tokens, input);
        return settle(await sendModuleTx(requireModule(), { functionName: "setPolicy", args }), (s) => ({ ...s, isActive: true }));
      },
      policyBlocker: (input, tokens, nowSec) => setPolicyBlocker(chain, tokens, input, nowSec),
    };
  }, [canSign, read.status, notice, module, settle, chain]);
}

export const useOwnerControl: (view: VaultView, opts: OwnerControlOptions) => OwnerControl = isLive ? useLiveOwnerControl : useMockOwnerControl;
