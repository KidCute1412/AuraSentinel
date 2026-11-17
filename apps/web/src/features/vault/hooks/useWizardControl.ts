import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { getAddress } from "viem";
import type { Address } from "@agentshield/shared";
import { isLive } from "@/shared/api/dataSource";
import { mockTx, WALLET_BALANCES } from "@/shared/api/mockChain";
import { TOKENS, type TokenSymbol } from "@/shared/api/mockEngine";
import { useVaultView } from "@/shared/api/useVaultView";
import { fetchVaultView, type VaultView } from "@/shared/api/vaultSource";
import type { PolicyInput } from "@/shared/lib/policy";
import { guardFacts, newSaltNonce, wizardBlocker, type WizardAgent, type WizardChainFacts } from "@/shared/lib/wizard";
import { useWizardSafe } from "@/shared/session/wizardSafe";
import type { SentTx } from "@/shared/ui/TxButton";
import { UserFacingError } from "@/shared/ui/txState";
import { useSigner } from "@/shared/web3/moduleChain";
import { sendCreateSafe, sendDeployModule, sendEnableModule, sendInitialPolicy, useWalletGas, useWizardChain, WIZARD_AGENT } from "@/shared/web3/wizardChain";
import type { WizardFacts } from "../guards/wizard";
import { useChainFundsControl, type FundsControl } from "./useFundsControl";

/**
 * Everything the vault wizard (L9) shows and sends. Live builds read the chain and sign in the wallet; mock builds
 * walk the same steps against an in-memory Safe so every screen can be exercised without one.
 */
export interface WizardControl {
  /** The Safe being set up (remembered in this browser), or null before step 1. */
  safe: Address | null;
  facts: WizardChainFacts | null;
  /** Facts for the step guard; null = no Safe yet. */
  guard: WizardFacts | null;
  status: "idle" | "loading" | "ready" | "unavailable";
  /** Why this wallet cannot continue with this Safe (English), or null. */
  blocker: string | null;
  /** The wallet that signs: owner of everything the wizard creates. */
  owner: Address | null;
  /** Its AVAX for gas; null while unknown. */
  gas: bigint | null;
  /** Who will trade for the vault, named in the policy. Fixed, never typed by the user. */
  agent: WizardAgent;
  /** The server has picked the vault up (GET /vaults/{safe} answers), so its dashboard works. */
  registered: boolean;
  createSafe: () => Promise<SentTx>;
  deployModule: () => Promise<SentTx>;
  enableModule: () => Promise<SentTx>;
  setPolicy: (input: PolicyInput) => () => Promise<SentTx>;
  funds: FundsControl;
  /** Forget the Safe in this browser (start another vault). Nothing on-chain changes. */
  forget: () => void;
}

const SYMBOLS: TokenSymbol[] = ["USDC", "WAVAX"];
const noTx = (why: string) => () => Promise.reject(new UserFacingError(why));

/** Poll the server until it serves the new vault: the indexer saw ModuleDeployed, or it found the module on-chain. */
function useRegistered(safe: Address | null, ready: boolean): boolean {
  const q = useQuery({
    queryKey: ["vault", (safe ?? "none").toLowerCase(), "wizard-registered"],
    queryFn: () => fetchVaultView(safe!),
    enabled: !!safe && ready,
    refetchInterval: (query) => (query.state.data ? false : 3_000),
    retry: false,
  });
  return !!q.data;
}

export function useLiveWizardControl(): WizardControl {
  const { safe, setSafe, remember } = useWizardSafe();
  const owner = useSigner();
  const read = useWizardChain(safe);
  const { refetch } = read;
  const gas = useWalletGas(owner);
  const nowSec = Math.floor(Date.now() / 1000);
  const facts = read.facts;
  const guard = useMemo(() => (facts && facts.safeExists ? guardFacts(facts, nowSec) : null), [facts, nowSec]);
  const complete = !!guard && guard.moduleEnabled && guard.policyActive && guard.funded;
  const registered = useRegistered(safe, complete);

  /** After a receipt: read the chain again at once instead of waiting for the next poll. */
  const settle = useCallback(
    (tx: SentTx): SentTx => ({
      hash: tx.hash,
      wait: async () => {
        await tx.wait();
        await refetch();
      },
    }),
    [refetch],
  );

  const addresses = useMemo(() => ({ usdc: WIZARD_AGENT.usdc, wavax: WIZARD_AGENT.wavax }), []);
  const vaultBalance = useCallback((s: TokenSymbol) => (s === "USDC" ? (facts?.balances.usdc ?? 0n) : (facts?.balances.wavax ?? 0n)), [facts]);
  const onSettled = useCallback(() => void refetch(), [refetch]);
  const funds = useChainFundsControl(safe ?? WIZARD_AGENT.usdc, safe ? addresses : null, vaultBalance, onSettled);

  return {
    safe,
    facts,
    guard,
    status: read.status,
    blocker: wizardBlocker(facts, owner),
    owner,
    gas,
    agent: WIZARD_AGENT,
    registered,
    createSafe: async () => {
      const tx = await sendCreateSafe(newSaltNonce());
      // CREATE2: the address is final once signed. Saved now, so closing the tab while it mines still resumes;
      // this tab switches to it once mined (switching earlier would unmount the button that is waiting).
      remember(tx.safe);
      return {
        hash: tx.hash,
        wait: async () => {
          await tx.wait();
          setSafe(tx.safe);
        },
      };
    },
    deployModule: async () => {
      if (!safe) throw new UserFacingError("Create the Safe first.");
      return settle(await sendDeployModule(safe));
    },
    enableModule: async () => {
      if (!safe || !facts?.module) throw new UserFacingError("Deploy the module first.");
      return settle(await sendEnableModule(safe, facts.module));
    },
    setPolicy: (input) => async () => {
      if (!facts?.module) throw new UserFacingError("Deploy the module first.");
      return settle(await sendInitialPolicy(facts.module, input));
    },
    funds,
    forget: () => setSafe(null),
  };
}

// ------------------------------------------------------------------ mock

interface MockWizard {
  /** Changes made in this tab on top of the fixture vaults (or a Safe "created" here). */
  patches: Record<string, Partial<WizardChainFacts>>;
  patch: (safe: Address, p: Partial<WizardChainFacts>) => void;
}

export const useMockWizard = create<MockWizard>((set) => ({
  patches: {},
  patch: (safe, p) => set((s) => ({ patches: { ...s.patches, [safe.toLowerCase()]: { ...s.patches[safe.toLowerCase()], ...p } } })),
}));

const MOCK_AGENT = WIZARD_AGENT;

/** A fixture vault as wizard facts (the dev bar picks "stopped at step 2 / 3"). */
function factsFromView(view: VaultView | null | undefined, nowSec: number): WizardChainFacts {
  return {
    safeExists: !!view,
    owners: view?.owners ?? [],
    threshold: view ? 1n : null,
    module: view?.module ?? null,
    moduleOwner: view?.owners[0] ?? null,
    moduleEnabled: !!view?.chain.moduleEnabled,
    agentSigner: view?.chain.policyActive ? (view.agent ?? MOCK_AGENT.agent) : null,
    expiry: view?.chain.policyActive ? nowSec + 30 * 86_400 : 0,
    isActive: !!view?.chain.policyActive,
    balances: view?.chain.funded ? { usdc: 10_000_000_000n, wavax: 0n } : { usdc: 0n, wavax: 0n },
  };
}

const randomAddress = (): Address => getAddress(`0x${Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, "0")).join("")}`);

export function useMockWizardControl(wallet: Address | null): WizardControl {
  const { safe, setSafe, remember } = useWizardSafe();
  const { data: view, isPending } = useVaultView(safe);
  const patches = useMockWizard((s) => s.patches);
  const patch = useMockWizard((s) => s.patch);
  const nowSec = Math.floor(Date.now() / 1000);
  const own = safe ? patches[safe.toLowerCase()] : undefined;
  const facts = useMemo<WizardChainFacts | null>(() => (safe && (!isPending || own) ? { ...factsFromView(view, nowSec), ...own } : null), [safe, isPending, view, own, nowSec]);
  const guard = facts && facts.safeExists ? guardFacts(facts, nowSec) : null;
  const need = (why: string) => {
    if (!safe) throw new UserFacingError(why);
    return safe;
  };

  const funds: FundsControl = {
    canAct: !!safe && !!wallet,
    notice: null,
    tokens: SYMBOLS.map((symbol) => ({
      symbol,
      address: TOKENS[symbol].address,
      decimals: TOKENS[symbol].decimals,
      vault: symbol === "USDC" ? (facts?.balances.usdc ?? 0n) : (facts?.balances.wavax ?? 0n),
      wallet: WALLET_BALANCES[symbol],
      faucetAmount: null,
      faucetAvailableAt: 0,
    })),
    deposit: (symbol, amount) =>
      mockTx(() => {
        const s = need("Create the Safe first.");
        const b = facts?.balances ?? { usdc: 0n, wavax: 0n };
        patch(s, { balances: symbol === "USDC" ? { ...b, usdc: b.usdc + amount } : { ...b, wavax: b.wavax + amount } });
      }),
    withdraw: () => noTx("Withdraw from the vault page."),
    faucet: () => noTx("No faucet in the simulation."),
  };

  return {
    safe,
    facts,
    guard,
    status: !safe ? "idle" : facts ? "ready" : "loading",
    blocker: wizardBlocker(facts, wallet),
    owner: wallet,
    gas: 10n ** 18n,
    agent: MOCK_AGENT,
    registered: true,
    createSafe: async () => {
      const created = randomAddress();
      const tx = await mockTx(() => patch(created, { safeExists: true, owners: wallet ? [wallet] : [], threshold: 1n }))();
      remember(created);
      return {
        hash: tx.hash,
        wait: async () => {
          await tx.wait();
          setSafe(created);
        },
      };
    },
    deployModule: mockTx(() => patch(need("Create the Safe first."), { module: randomAddress(), moduleOwner: wallet })),
    enableModule: mockTx(() => patch(need("Create the Safe first."), { moduleEnabled: true })),
    setPolicy: (input) => mockTx(() => patch(need("Create the Safe first."), { agentSigner: MOCK_AGENT.agent, isActive: true, expiry: input.expiry })),
    funds,
    forget: () => setSafe(null),
  };
}

export const useWizardControl: (wallet: Address | null) => WizardControl = isLive ? () => useLiveWizardControl() : useMockWizardControl;
