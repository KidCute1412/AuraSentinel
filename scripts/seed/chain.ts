/** Section A of `pnpm seed --verify`: the Fuji deployment, read straight from the chain. Read-only (D7). */
import { agentPolicyModuleAbi, agentShieldFactoryAbi } from "@agentshield/shared";
import { createPublicClient, erc20Abi, getAddress, http, parseAbi, type Address, type PublicClient } from "viem";
import { avalancheFuji } from "viem/chains";
import {
  judgeAgentGas,
  judgeAllowances,
  judgeBudget,
  judgeDemoLimits,
  judgePolicyLive,
  judgePool,
  judgeSafeFunds,
  redactUrl,
  type Verdict,
} from "./judge.ts";
import type { Report } from "./report.ts";

export interface Deployment {
  chainId: number;
  factory: Address;
  usdc: Address;
  wavax: Address;
  router: Address;
  pair: Address;
  agent: Address;
  publicSafe: Address;
  publicModule: Address;
  stageSafe: Address;
  stageModule: Address;
}

const safeAbi = parseAbi(["function getOwners() view returns (address[])", "function isModuleEnabled(address) view returns (bool)"]);
const pairAbi = parseAbi(["function getReserves() view returns (uint112, uint112, uint32)", "function token0() view returns (address)"]);
const VERIFY_API = "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan/api";
const ZERO = "0x0000000000000000000000000000000000000000";
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const pass = (detail: string): Verdict => ({ status: "PASS", detail });
const fail = (detail: string): Verdict => ({ status: "FAIL", detail });

/** A1: every configured RPC, one by one. Returns a client on the first one that answers on chain 43113. */
export async function checkRpcs(report: Report, urls: string[]): Promise<PublicClient | null> {
  let primary: PublicClient | null = null;
  for (const [i, url] of urls.entries()) {
    const client = createPublicClient({ chain: avalancheFuji, transport: http(url, { timeout: 8_000, retryCount: 1 }) });
    const label = `RPC ${i === 0 ? "primary" : `fallback ${i}`} ${redactUrl(url)}`;
    try {
      const [id, block] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
      if (id !== avalancheFuji.id) {
        report.add("A1", label, fail(`chain id ${id}, expected ${avalancheFuji.id}`));
        continue;
      }
      report.add("A1", label, pass(`chain ${id}, block ${block}`));
      primary ??= client as PublicClient;
    } catch (err) {
      report.add("A1", label, { status: i === 0 ? "FAIL" : "WARN", detail: `no answer (${shortError(err)})` });
    }
  }
  return primary;
}

export async function checkDeployment(report: Report, client: PublicClient, d: Deployment, minAgentGasWei: bigint): Promise<void> {
  // A2: everything in fuji.json is a contract (the agent is an EOA, checked for gas instead).
  const contracts: [string, Address][] = [
    ["factory", d.factory],
    ["USDC", d.usdc],
    ["WAVAX", d.wavax],
    ["Trader Joe router", d.router],
    ["Trader Joe pair", d.pair],
    ["public Safe", d.publicSafe],
    ["public module", d.publicModule],
    ["stage Safe", d.stageSafe],
    ["stage module", d.stageModule],
  ];
  const codes = await Promise.all(contracts.map(([, a]) => client.getCode({ address: a })));
  const missing = contracts.filter((_, i) => !codes[i] || codes[i] === "0x").map(([n]) => n);
  report.add("A2", "Every address in fuji.json has code", missing.length ? fail(`no code at: ${missing.join(", ")}`) : pass(`${contracts.length} contracts`));

  const now = Number((await client.getBlock()).timestamp);
  for (const vault of [
    { name: "public", safe: d.publicSafe, module: d.publicModule },
    { name: "stage", safe: d.stageSafe, module: d.stageModule },
  ]) {
    const tag = `[${vault.name}]`;
    const m = { address: vault.module, abi: agentPolicyModuleAbi } as const;
    const [moduleOf, enabled, moduleSafe, owner, owners, policy, usdcLimit, spent] = await Promise.all([
      client.readContract({ address: d.factory, abi: agentShieldFactoryAbi, functionName: "moduleOf", args: [vault.safe] }),
      client.readContract({ address: vault.safe, abi: safeAbi, functionName: "isModuleEnabled", args: [vault.module] }),
      client.readContract({ ...m, functionName: "safe" }),
      client.readContract({ ...m, functionName: "owner" }),
      client.readContract({ address: vault.safe, abi: safeAbi, functionName: "getOwners" }),
      client.readContract({ ...m, functionName: "policy" }),
      client.readContract({ ...m, functionName: "limits", args: [d.usdc] }),
      client.readContract({ ...m, functionName: "spentToday", args: [d.usdc] }),
    ]);

    // A3: the vault is wired the way the factory recorded it.
    const wired = same(moduleOf, vault.module) && enabled && same(moduleSafe, vault.safe);
    report.add(
      "A3",
      `${tag} Safe <-> module wiring`,
      wired ? pass("factory.moduleOf, Safe.isModuleEnabled and module.safe agree") : fail(`moduleOf ${moduleOf}, enabled ${enabled}, module.safe ${moduleSafe}`),
    );

    // A4: the module owner (who signs Kill / setPolicy) is an owner of the Safe.
    report.add(
      "A4",
      `${tag} Module owner is a Safe owner`,
      owners.some((o) => same(o, owner)) ? pass(`owner ${owner}`) : fail(`module owner ${owner} is not in Safe.getOwners()`),
    );

    // A5: the policy names our agent and router and is live.
    const [agentSigner, router, expiry, isActive] = policy;
    report.add(
      "A5",
      `${tag} Policy agent + router`,
      same(agentSigner, d.agent) && same(router, d.router) ? pass(`agent ${agentSigner}`) : fail(`agent ${agentSigner}${same(agentSigner, ZERO) ? " (no policy)" : ""}, router ${router}`),
    );
    report.add("A5", `${tag} Policy active`, judgePolicyLive(isActive, Number(expiry), now));

    // A6 / A7: limits and today's budget.
    const [maxPerTx, dailyCap] = usdcLimit;
    report.add("A6", `${tag} USDC limits`, judgeDemoLimits(maxPerTx, dailyCap));
    report.add("A7", `${tag} Budget today`, judgeBudget(spent, dailyCap, now));

    // A8: funds and allowances.
    const [usdcBal, wavaxBal, usdcAllow, wavaxAllow] = await Promise.all([
      client.readContract({ address: d.usdc, abi: erc20Abi, functionName: "balanceOf", args: [vault.safe] }),
      client.readContract({ address: d.wavax, abi: erc20Abi, functionName: "balanceOf", args: [vault.safe] }),
      client.readContract({ address: d.usdc, abi: erc20Abi, functionName: "allowance", args: [vault.safe, d.router] }),
      client.readContract({ address: d.wavax, abi: erc20Abi, functionName: "allowance", args: [vault.safe, d.router] }),
    ]);
    report.add("A8", `${tag} Safe balances`, judgeSafeFunds(usdcBal, wavaxBal));
    report.add("A8", `${tag} Router allowance`, judgeAllowances(usdcAllow, wavaxAllow));
  }

  // A9: the agent can pay gas.
  report.add("A9", "Agent gas", judgeAgentGas(await client.getBalance({ address: d.agent }), minAgentGasWei));

  // A10: the pool the agent trades against.
  const [[r0, r1], token0] = await Promise.all([
    client.readContract({ address: d.pair, abi: pairAbi, functionName: "getReserves" }),
    client.readContract({ address: d.pair, abi: pairAbi, functionName: "token0" }),
  ]);
  const [usdcReserve, wavaxReserve] = same(token0, d.usdc) ? [r0, r1] : [r1, r0];
  report.add("A10", "Trader Joe pool", judgePool(usdcReserve, wavaxReserve));
}

/** A11: source published on Snowtrace (Routescan's Etherscan-compatible API, public). */
export async function checkVerified(report: Report, d: Deployment): Promise<void> {
  const list: [string, Address][] = [
    ["AgentShieldFactory", d.factory],
    ["MockUSDC", d.usdc],
    ["MockWAVAX", d.wavax],
    ["AgentPolicyModule (public)", d.publicModule],
    ["AgentPolicyModule (stage)", d.stageModule],
  ];
  const results = await Promise.all(
    list.map(async ([name, address]) => {
      try {
        const res = await fetch(`${VERIFY_API}?module=contract&action=getsourcecode&address=${address}`, { signal: AbortSignal.timeout(8_000) });
        const body = (await res.json()) as { result?: { SourceCode?: string }[] };
        return { name, ok: !!body.result?.[0]?.SourceCode, error: null };
      } catch (err) {
        return { name, ok: false, error: shortError(err) };
      }
    }),
  );
  const unverified = results.filter((r) => !r.ok);
  report.add(
    "A11",
    "Source verified on Snowtrace",
    unverified.length === 0
      ? pass(`${results.length} contracts`)
      : { status: "WARN", detail: unverified.map((r) => `${r.name}${r.error ? ` (${r.error})` : ""}`).join(", ") },
  );
}

export function parseDeployment(json: Record<string, unknown>): Deployment {
  const a = (k: string) => getAddress(String(json[k]));
  return {
    chainId: Number(json.chainId),
    factory: a("factory"),
    usdc: a("usdc"),
    wavax: a("wavax"),
    router: a("router"),
    pair: a("pair"),
    agent: a("agent"),
    publicSafe: a("publicSafe"),
    publicModule: a("publicModule"),
    stageSafe: a("stageSafe"),
    stageModule: a("stageModule"),
  };
}

export const shortError = (err: unknown): string => (err instanceof Error ? (err.message.split("\n")[0] ?? "").slice(0, 120) : String(err));
