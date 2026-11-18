import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import type { Address } from "@agentshield/shared";
import { useSession } from "@/shared/session/sessionStore";
import { useWizardSafe } from "@/shared/session/wizardSafe";
import type { WizardChainFacts } from "@/shared/lib/wizard";
import { jsonResponse } from "@/test/apiFixtures";
import { WizardPage } from "./WizardPage";
import { REGISTER_PATIENCE_MS } from "./WizardSteps";

// A VITE_DATA_SOURCE=live build: the wizard reads the chain (mocked below) and signs in the wallet (spies).
vi.mock("@/shared/api/dataSource", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/dataSource")>();
  return { ...actual, DATA_SOURCE: "live", isLive: true };
});

const OWNER = "0x7777777777777777777777777777777777777777" as Address;
const SAFE = getAddress("0x5afe000000000000000000000000000000000001");
const MODULE = getAddress("0x40d0000000000000000000000000000000000001");
const USDC = "0x99b583DC1f12668e1274261B952acD9398f3835F" as Address;
const WAVAX = "0x88B55FbE883231E073A820061EDE453d2843fcc1" as Address;
const AGENT = "0x9A478E17cfE33c98e5E74B4d744d249526c9be18" as Address;

/** The chain as the wizard reads it: a tiny store, so a "confirmed" transaction re-renders the page like a poll would. */
const chain = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    facts: null as WizardChainFacts | null,
    signer: "0x7777777777777777777777777777777777777777" as string | null,
    gas: 10n ** 18n as bigint | null,
    set(f: WizardChainFacts | null) {
      this.facts = f;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});
const sends = vi.hoisted(() => ({
  createSafe: vi.fn(),
  deployModule: vi.fn(),
  enableModule: vi.fn(),
  initialPolicy: vi.fn(),
  deposit: vi.fn(),
  faucet: vi.fn(),
}));

vi.mock("@/shared/web3/wizardChain", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
  WIZARD_AGENT: {
    agent: "0x9A478E17cfE33c98e5E74B4d744d249526c9be18",
    router: "0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901",
    usdc: "0x99b583DC1f12668e1274261B952acD9398f3835F",
    wavax: "0x88B55FbE883231E073A820061EDE453d2843fcc1",
  },
  useWizardChain: (safe: string | null) => {
    const facts = useSyncExternalStore(chain.subscribe, () => chain.facts);
    return { facts: safe ? facts : null, status: safe ? (facts ? "ready" : "loading") : "idle", refetch: async () => undefined };
  },
  useWalletGas: () => chain.gas,
  sendCreateSafe: sends.createSafe,
  sendDeployModule: sends.deployModule,
  sendEnableModule: sends.enableModule,
  sendInitialPolicy: sends.initialPolicy,
  };
});
vi.mock("@/shared/web3/moduleChain", () => ({ useSigner: () => chain.signer }));
vi.mock("@/shared/web3/fundsChain", () => ({
  useFundsChain: (safe: string | null) => ({
    owners: safe ? [OWNER] : null,
    threshold: safe ? 1n : null,
    tokens: safe
      ? [
          { wallet: 5_000_000_000n, faucetAmount: 5_000_000_000n, faucetCooldown: 3_600n, lastFaucetAt: 0n },
          { wallet: 0n, faucetAmount: 200n * 10n ** 18n, faucetCooldown: 3_600n, lastFaucetAt: 0n },
        ]
      : null,
    status: safe ? "ready" : "loading",
    refetch: async () => undefined,
  }),
  sendDeposit: sends.deposit,
  sendFaucet: sends.faucet,
  sendWithdraw: vi.fn(),
}));
vi.mock("@/shared/web3/WalletButton", () => ({ WalletButton: () => <button type="button">Connect wallet</button> }));
// The header's account menu signs out through wagmi; not under test here.
vi.mock("@/shared/session/useSignOut", () => ({ useSignOut: () => () => undefined }));

const facts = (over: Partial<WizardChainFacts> = {}): WizardChainFacts => ({
  safeExists: true,
  owners: [OWNER],
  threshold: 1n,
  module: null,
  moduleOwner: null,
  moduleEnabled: false,
  agentSigner: null,
  expiry: 0,
  isActive: false,
  balances: { usdc: 0n, wavax: 0n },
  ...over,
});
const atModule = () => facts({ module: MODULE, moduleOwner: OWNER });
const atPolicy = () => facts({ module: MODULE, moduleOwner: OWNER, moduleEnabled: true });
const atFund = () => facts({ module: MODULE, moduleOwner: OWNER, moduleEnabled: true, agentSigner: AGENT, isActive: true, expiry: Math.floor(Date.now() / 1000) + 86_400 });
const complete = () => ({ ...atFund(), balances: { usdc: 1_000_000_000n, wavax: 0n } });

/** A signed tx whose receipt makes `after` the new chain state, as a real confirmation would. */
const tx = (after?: () => WizardChainFacts, extra: object = {}) => ({
  hash: `0x${"ab".repeat(32)}`,
  wait: async () => {
    if (after) chain.set(after());
  },
  ...extra,
});

const fetchMock = vi.fn<typeof fetch>();
let qc: QueryClient;
let registered = false;

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname}</output>;
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/vaults/new" element={<WizardPage />} />
          <Route path="/vaults/new/:step" element={<WizardPage />} />
          <Route path="/vaults/:safe" element={<p>Vault page</p>} />
          <Route path="/signin" element={<p>Sign in page</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const where = () => screen.getByTestId("where").textContent;

beforeAll(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false, onchange: null })) as typeof window.matchMedia;
});

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  chain.facts = null;
  chain.signer = OWNER;
  chain.gas = 10n ** 18n;
  registered = false;
  for (const f of Object.values(sends)) f.mockReset();
  useSession.setState({ wallet: { address: OWNER, chainId: 43113 } });
  useWizardSafe.getState().setSafe(null);
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith(`/vaults/${SAFE}`) && registered) return jsonResponse({ safe: SAFE, module: MODULE, owner: OWNER, agent: AGENT, isDemo: false, registered: true, explorer: "https://testnet.snowtrace.io" });
    return new Response(JSON.stringify({ code: "VAULT_NOT_FOUND", status: 404 }), { status: 404, headers: { "Content-Type": "application/problem+json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("vault wizard (L9), live build", () => {
  it("needs a signed-in wallet first, then comes back to the same step", () => {
    useSession.setState({ wallet: null });
    renderAt("/vaults/new/policy");
    expect(screen.getByText("Sign in page")).toBeInTheDocument();
  });

  it("step 1: creates a 1-of-1 Safe, remembers it as soon as it is signed, then moves on to the module", async () => {
    sends.createSafe.mockResolvedValue(tx(() => facts(), { safe: SAFE }));
    renderAt("/vaults/new");
    await waitFor(() => expect(where()).toBe("/vaults/new/safe"));
    fireEvent.click(screen.getByRole("button", { name: "Sign and create Safe" }));
    await waitFor(() => expect(sends.createSafe).toHaveBeenCalledTimes(1));
    expect(typeof sends.createSafe.mock.calls[0]![0]).toBe("bigint"); // a fresh salt
    await waitFor(() => expect(useWizardSafe.getState().safe).toBe(SAFE));
    expect(localStorage.getItem("agentshield.wizard.safe")).toBe(SAFE);
    await waitFor(() => expect(where()).toBe("/vaults/new/module"));
    expect(screen.getByRole("button", { name: "Sign and deploy module" })).toBeInTheDocument();
  });

  it("warns before step 1 when the wallet is low on AVAX for gas", async () => {
    chain.gas = 5_000_000_000_000_000n; // 0.005 AVAX
    renderAt("/vaults/new/safe");
    expect(await screen.findByText(/Your wallet has 0.005 AVAX/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Get test AVAX/ })).toHaveAttribute("target", "_blank");
  });

  it("an existing Safe can be picked by address instead", async () => {
    renderAt("/vaults/new/safe");
    fireEvent.click(await screen.findByRole("button", { name: "I already have a Safe on Fuji" }));
    const input = screen.getByLabelText("Safe address");
    fireEvent.change(input, { target: { value: "0x123" } });
    expect(screen.getByRole("button", { name: "Use" })).toBeDisabled();
    fireEvent.change(input, { target: { value: SAFE.toLowerCase() } });
    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    expect(useWizardSafe.getState().safe).toBe(SAFE);
  });

  it("resume after closing the tab: the module is deployed but not enabled, so it opens on enabling it", async () => {
    useWizardSafe.getState().setSafe(SAFE);
    chain.facts = atModule();
    sends.enableModule.mockResolvedValue(tx(atPolicy));
    renderAt("/vaults/new");
    await waitFor(() => expect(where()).toBe("/vaults/new/module"));
    expect(screen.getByText("Module deployed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign and deploy module" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign and enable module" }));
    await waitFor(() => expect(sends.enableModule).toHaveBeenCalledWith(SAFE, MODULE));
    await waitFor(() => expect(where()).toBe("/vaults/new/policy"));
  });

  it("a step ahead of the chain sends the user back, with a notice", async () => {
    useWizardSafe.getState().setSafe(SAFE);
    chain.facts = atModule();
    renderAt("/vaults/new/fund");
    await waitFor(() => expect(where()).toBe("/vaults/new/module"));
    expect(screen.getByText('Finish the "Module" step before "Fund".')).toBeInTheDocument();
  });

  it("a finished step is view-only", async () => {
    useWizardSafe.getState().setSafe(SAFE);
    chain.facts = atPolicy();
    renderAt("/vaults/new/safe");
    expect(await screen.findByRole("heading", { name: "Step 1 · Safe" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign and create Safe" })).toBeNull();
  });

  it("step 3: prefilled with the demo limits, names the AuraSentinel agent, sends base units", async () => {
    useWizardSafe.getState().setSafe(SAFE);
    chain.facts = atPolicy();
    sends.initialPolicy.mockResolvedValue(tx(atFund));
    renderAt("/vaults/new/policy");
    const panel = (await screen.findByRole("heading", { name: "Step 3 · Policy" })).closest("section")!;
    expect(within(panel).getByLabelText("USDC per transaction")).toHaveValue("500");
    expect(within(panel).getByLabelText("USDC per day")).toHaveValue("1500");
    expect(within(panel).getByTitle(AGENT)).toBeInTheDocument();

    // A per-transaction limit above the daily one never reaches the wallet.
    fireEvent.change(within(panel).getByLabelText("USDC per transaction"), { target: { value: "2000" } });
    expect(within(panel).getByText("Per-transaction limit cannot exceed the daily limit")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Sign and set policy" })).toBeDisabled();

    fireEvent.change(within(panel).getByLabelText("USDC per transaction"), { target: { value: "250.5" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Sign and set policy" }));
    await waitFor(() => expect(sends.initialPolicy).toHaveBeenCalledTimes(1));
    const [module, input] = sends.initialPolicy.mock.calls[0]!;
    expect(module).toBe(MODULE);
    expect(input).toMatchObject({ usdcMaxPerTx: 250_500_000n, usdcDailyCap: 1_500_000_000n, wavaxMaxPerTx: 20n * 10n ** 18n, wavaxDailyCap: 60n * 10n ** 18n });
    expect(input.expiry).toBeGreaterThan(Math.floor(Date.now() / 1000) + 29 * 86_400);
    await waitFor(() => expect(where()).toBe("/vaults/new/fund"));
  });

  it("step 4: deposit only (no withdraw here), faucet available, real token address and base units", async () => {
    useWizardSafe.getState().setSafe(SAFE);
    chain.facts = atFund();
    sends.deposit.mockResolvedValue(tx(complete));
    renderAt("/vaults/new/fund");
    const panel = (await screen.findByRole("heading", { name: "Deposit" })).closest("section")!;
    expect(within(panel).queryByRole("tab")).toBeNull();
    expect(within(panel).getByRole("button", { name: "Get 5,000 USDC" })).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Amount"), { target: { value: "1000" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Sign and deposit" }));
    await waitFor(() => expect(sends.deposit).toHaveBeenCalledWith(USDC, SAFE, 1_000_000_000n));
    expect(await screen.findByRole("heading", { name: "Vault ready" })).toBeInTheDocument();
    expect(WAVAX).toBeTruthy();
  });

  it("done: waits for the server to serve the vault, then opens it and forgets the wizard pointer", async () => {
    useWizardSafe.getState().setSafe(SAFE);
    chain.facts = complete();
    renderAt("/vaults/new");
    const open = await screen.findByRole("button", { name: "Open your vault" });
    expect(open).toBeDisabled();
    expect(screen.getByText(/Waiting for AuraSentinel to pick up the new vault/)).toBeInTheDocument();

    registered = true;
    await act(async () => {
      await qc.refetchQueries();
    });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    expect(await screen.findByText("Vault page")).toBeInTheDocument();
    expect(where()).toBe(`/vaults/${SAFE}`);
    expect(useWizardSafe.getState().safe).toBeNull();
  });

  it("a Safe this wallet does not own cannot be continued; starting over forgets it", async () => {
    useWizardSafe.getState().setSafe(SAFE);
    chain.facts = facts({ owners: ["0x8888888888888888888888888888888888888888"] });
    renderAt("/vaults/new");
    expect(await screen.findByText(/not an owner of this Safe/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start a new vault" }));
    expect(useWizardSafe.getState().safe).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign and create Safe" })).toBeInTheDocument());
  });

  it("says how many wallet confirmations are left", async () => {
    renderAt("/vaults/new/safe");
    expect(await screen.findByText(/About 5 wallet confirmations left/)).toBeInTheDocument();
  });

  it("resumed at enabling the module: 3 confirmations left", async () => {
    useWizardSafe.getState().setSafe(SAFE);
    chain.facts = atModule();
    renderAt("/vaults/new/module");
    expect(await screen.findByText(/About 3 wallet confirmations left/)).toBeInTheDocument();
  });

  it("no wallet connected: offers to connect one right in step 1", async () => {
    chain.signer = null;
    renderAt("/vaults/new/safe");
    expect(await screen.findByText("Connect the wallet that will own the vault.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign and create Safe" })).toBeDisabled();
  });

  it("warns when the wallet that signs is not the signed-in account", async () => {
    chain.signer = "0x8888888888888888888888888888888888888888";
    renderAt("/vaults/new/safe");
    expect(await screen.findByText(/The vault will belong to 0x8888/)).toBeInTheDocument();
  });

  it("step 3 restates the limits in plain words", async () => {
    useWizardSafe.getState().setSafe(SAFE);
    chain.facts = atPolicy();
    renderAt("/vaults/new/policy");
    expect(await screen.findByText(/In plain words: the agent can swap at most/)).toHaveTextContent(/500 USDC per trade and 1,500 USDC per day \(WAVAX: 20 \/ 60\)/);
  });

  it("done: if the server never answers, the vault can still be opened after a short wait", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      useWizardSafe.getState().setSafe(SAFE);
      chain.facts = complete();
      renderAt("/vaults/new");
      const open = await screen.findByRole("button", { name: "Open your vault" });
      expect(open).toBeDisabled();
      await act(async () => {
        vi.advanceTimersByTime(REGISTER_PATIENCE_MS + 100);
      });
      expect(open).toBeEnabled();
      expect(screen.getByText(/You can open it anyway/)).toBeInTheDocument();
      fireEvent.click(open);
      expect(await screen.findByText("Vault page")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
