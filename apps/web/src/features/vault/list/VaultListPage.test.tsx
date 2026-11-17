import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { getAddress } from "viem";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { StateDto } from "@agentshield/shared";
import type { WizardChainFacts } from "@/shared/lib/wizard";
import { useSession } from "@/shared/session/sessionStore";
import { useWizardSafe } from "@/shared/session/wizardSafe";
import { job, jsonResponse, state } from "@/test/apiFixtures";
import { VaultListPage } from "./VaultListPage";

// A VITE_DATA_SOURCE=live build: GET /vaults, /state and /jobs are served by the fetch mock below.
vi.mock("@/shared/api/dataSource", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/dataSource")>();
  return { ...actual, DATA_SOURCE: "live", isLive: true };
});

const OWNER = getAddress("0x7777777777777777777777777777777777777777");
const OTHER = getAddress("0x8888888888888888888888888888888888888888");
const safe = (n: number) => getAddress(`0x5afe${n.toString(16).padStart(36, "0")}`);
const mod = (n: number) => getAddress(`0x40d0${n.toString(16).padStart(36, "0")}`);
const [ACTIVE, REVOKED, SETUP, BROKEN, EXPIRED, NOT_MINE, IN_WIZARD] = [1, 2, 3, 4, 5, 6, 7].map(safe);

// The Safe in the wizard is read from the chain (shared/web3/wizardChain), as on /vaults/new.
const chain = vi.hoisted(() => ({ facts: null as unknown }));
vi.mock("@/shared/web3/wizardChain", () => ({
  WIZARD_AGENT: { agent: "0x9A478E17cfE33c98e5E74B4d744d249526c9be18", router: "0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901", usdc: "0x99b583DC1f12668e1274261B952acD9398f3835F", wavax: "0x88B55FbE883231E073A820061EDE453d2843fcc1" },
  useWizardChain: (s: string | null) => ({ facts: s ? chain.facts : null, status: s ? "ready" : "idle", refetch: async () => undefined }),
  useWalletGas: () => 10n ** 18n,
  sendCreateSafe: vi.fn(),
  sendDeployModule: vi.fn(),
  sendEnableModule: vi.fn(),
  sendInitialPolicy: vi.fn(),
}));
vi.mock("@/shared/web3/moduleChain", () => ({ useSigner: () => "0x7777777777777777777777777777777777777777" }));
vi.mock("@/shared/web3/fundsChain", () => ({
  useFundsChain: () => ({ owners: null, threshold: null, tokens: null, status: "loading", refetch: async () => undefined }),
  sendDeposit: vi.fn(),
  sendFaucet: vi.fn(),
  sendWithdraw: vi.fn(),
}));
vi.mock("@/shared/web3/WalletButton", () => ({ WalletButton: () => <button type="button">Connect wallet</button> }));
vi.mock("@/shared/session/useSignOut", () => ({ useSignOut: () => () => undefined }));

const row = (s: string, n: number, owner = OWNER, isDemo = false) => ({ safe: s, module: mod(n), owner, isDemo, createdAtBlock: String(1_000 + n) });
const stateOf = (s: string, over: Partial<StateDto> = {}): StateDto => ({ ...state, safe: s as StateDto["safe"], ...over });

let registry: ReturnType<typeof row>[];
let apiDown = false;
const states: Record<string, () => Response> = {
  [ACTIVE]: () => jsonResponse(stateOf(ACTIVE)),
  [REVOKED]: () => jsonResponse(stateOf(REVOKED, { isActive: false })),
  [SETUP]: () => jsonResponse(stateOf(SETUP, { isActive: false, policyEpoch: 0, policy: { ...state.policy, agentSigner: "0x0000000000000000000000000000000000000000" } })),
  [BROKEN]: () => new Response(JSON.stringify({ code: "CHAIN_UNAVAILABLE", status: 503 }), { status: 503, headers: { "Content-Type": "application/problem+json" } }),
  [EXPIRED]: () => jsonResponse(stateOf(EXPIRED, { policy: { ...state.policy, expiry: 1_000 } })),
};

const fetchMock = vi.fn<typeof fetch>();
let qc: QueryClient;

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{`${loc.pathname}${loc.search}`}</output>;
}

const renderAt = (path = "/vaults") =>
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/vaults" element={<VaultListPage />} />
          <Route path="/vaults/new" element={<p>Wizard page</p>} />
          <Route path="/vaults/:safe/*" element={<p>Vault page</p>} />
          <Route path="/signin" element={<p>Sign in page</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
const where = () => screen.getByTestId("where").textContent;
const cardOf = (s: string) => screen.getByRole("article", { name: `Vault ${s}` });

beforeAll(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false, onchange: null })) as typeof window.matchMedia;
});

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registry = [row(ACTIVE, 1), row(REVOKED, 2), row(SETUP, 3), row(NOT_MINE, 6, OTHER, true)];
  apiDown = false;
  chain.facts = null;
  useSession.setState({ wallet: { address: OWNER, chainId: 43113 } });
  useWizardSafe.getState().setSafe(null);
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (apiDown) return new Response("", { status: 502 });
    if (/\/vaults$/.test(url)) return jsonResponse({ vaults: registry });
    const s = /\/vaults\/(0x[0-9a-fA-F]{40})\/state$/.exec(url)?.[1];
    if (s) return states[getAddress(s)]?.() ?? new Response("", { status: 404 });
    const j = /\/vaults\/(0x[0-9a-fA-F]{40})\/jobs\?limit=1$/.exec(url)?.[1];
    if (j) return jsonResponse({ items: getAddress(j) === ACTIVE ? [job({ vault: ACTIVE, status: "confirmed", createdAt: new Date(Date.now() - 5 * 60_000).toISOString() })] : [], nextCursor: null });
    return new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("/vaults: my vaults (live build)", () => {
  it("needs a signed-in wallet", () => {
    useSession.setState({ wallet: null });
    renderAt();
    expect(screen.getByText("Sign in page")).toBeInTheDocument();
  });

  it("lists only the wallet's vaults, newest first, each with its chain status", async () => {
    renderAt();
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual([`Vault ${SETUP}`, `Vault ${REVOKED}`, `Vault ${ACTIVE}`]);
    expect(screen.queryByRole("article", { name: `Vault ${NOT_MINE}` })).toBeNull();
    await waitFor(() => expect(within(cardOf(ACTIVE)).getByText("Protected")).toBeInTheDocument());
    expect(within(cardOf(REVOKED)).getByText("Revoked")).toBeInTheDocument();
    expect(within(cardOf(SETUP)).getByText("Incomplete")).toBeInTheDocument();
  });

  it("a protected card shows today's budget, balances and the latest job", async () => {
    renderAt();
    const card = await waitFor(() => cardOf(ACTIVE));
    await waitFor(() => expect(within(card).getByText("13.3%")).toBeInTheDocument());
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "13");
    expect(within(card).getByText("2,800")).toBeInTheDocument();
    expect(await within(card).findByText("5 min ago")).toBeInTheDocument();
    expect(within(card).getByText("Safe")).toBeInTheDocument(); // the confirmed job's badge
    expect(await within(cardOf(REVOKED)).findByText("No agent activity yet.")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("link", { name: /Open vault/ }));
    expect(where()).toBe(`/vaults/${ACTIVE}`);
  });

  it("filters by status through the URL, with counts", async () => {
    renderAt();
    await waitFor(() => expect(within(cardOf(ACTIVE)).getByText("Protected")).toBeInTheDocument());
    const group = screen.getByRole("group", { name: "Filter by status" });
    expect(within(group).getByRole("button", { name: "Revoked 1" })).toBeInTheDocument();
    fireEvent.click(within(group).getByRole("button", { name: "Revoked 1" }));
    expect(where()).toBe("/vaults?status=revoked");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(cardOf(REVOKED)).toBeInTheDocument();
  });

  it("a shared filter link opens filtered; search narrows by address; nothing left offers to clear", async () => {
    renderAt("/vaults?status=incomplete");
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(cardOf(SETUP)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search by address" }), { target: { value: "beef" } });
    expect(await screen.findByText("No vault matches.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
  });

  it("an unfinished vault resumes in the wizard, pointed at that Safe", async () => {
    renderAt();
    const card = await waitFor(() => cardOf(SETUP));
    fireEvent.click(await within(card).findByRole("button", { name: /Continue setup/ }));
    expect(useWizardSafe.getState().safe).toBe(SETUP);
    expect(where()).toBe("/vaults/new");
  });

  it("one vault that cannot be read only marks its own card", async () => {
    registry = [row(ACTIVE, 1), row(BROKEN, 4)];
    renderAt();
    expect(await within(await waitFor(() => cardOf(BROKEN))).findByText(/Could not read this vault from the chain/)).toBeInTheDocument();
    await waitFor(() => expect(within(cardOf(ACTIVE)).getByText("Protected")).toBeInTheDocument());
  });

  it("the public demo vault, when the wallet owns it, is labelled as such", async () => {
    registry = [row(ACTIVE, 1, OWNER, true)];
    renderAt();
    expect(await within(await waitFor(() => cardOf(ACTIVE))).findByText("Public demo")).toBeInTheDocument();
  });

  it("an expired policy stays Protected, with a warning and a link to set a new one", async () => {
    registry = [row(EXPIRED, 5)];
    renderAt();
    const card = await waitFor(() => cardOf(EXPIRED));
    expect(await within(card).findByText(/Policy expired/)).toBeInTheDocument();
    expect(within(card).getByText("Protected")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Set a new policy" })).toHaveAttribute("href", `/vaults/${EXPIRED}/policy`);
  });

  it("no vaults yet: one sentence, Create vault and Try the demo", async () => {
    registry = [row(NOT_MINE, 6, OTHER, true)];
    renderAt();
    expect(await screen.findByRole("heading", { name: "No vaults yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try the demo" })).toHaveAttribute("href", "/demo");
    expect(screen.getAllByRole("link", { name: /Create vault/ }).every((l) => l.getAttribute("href") === "/vaults/new")).toBe(true);
  });

  it("a Safe still in the wizard has its own card, read from the chain, even with the server down", async () => {
    apiDown = true;
    useWizardSafe.getState().setSafe(IN_WIZARD);
    chain.facts = {
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
    } satisfies WizardChainFacts;
    renderAt();
    // The list is retried once before the page says so.
    expect(await screen.findByRole("alert", {}, { timeout: 4_000 })).toHaveTextContent(/Could not load your vaults/);
    const card = screen.getByRole("article", { name: "Vault in setup" });
    expect(within(card).getByText(/step 2 of 4/)).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: /Continue setup/ }));
    expect(where()).toBe("/vaults/new");
  });

  it("removing the setup card only forgets it in this browser", async () => {
    useWizardSafe.getState().setSafe(IN_WIZARD);
    chain.facts = { safeExists: false, owners: [], threshold: null, module: null, moduleOwner: null, moduleEnabled: false, agentSigner: null, expiry: 0, isActive: false, balances: { usdc: 0n, wavax: 0n } } satisfies WizardChainFacts;
    renderAt();
    const card = await screen.findByRole("article", { name: "Vault in setup" });
    expect(within(card).getByText(/Waiting for this Safe to appear/)).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Remove from list" }));
    expect(useWizardSafe.getState().safe).toBeNull();
    await waitFor(() => expect(screen.queryByRole("article", { name: "Vault in setup" })).toBeNull());
  });
});
