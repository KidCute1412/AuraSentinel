/** Section B of `pnpm seed --verify`: the running server (dev :4000 or prod :8080), compared with the chain. */
import { agentPolicyModuleAbi } from "@agentshield/shared";
import { erc20Abi, type PublicClient } from "viem";
import type { Deployment } from "./chain.ts";
import { shortError } from "./chain.ts";
import { judgeMirror, type Verdict } from "./judge.ts";
import type { Report } from "./report.ts";

const pass = (detail: string): Verdict => ({ status: "PASS", detail });
const fail = (detail: string): Verdict => ({ status: "FAIL", detail });
const warn = (detail: string): Verdict => ({ status: "WARN", detail });
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function getJson(url: string, init: RequestInit = {}): Promise<{ status: number; headers: Headers; body: unknown }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: keep the text
  }
  return { status: res.status, headers: res.headers, body };
}

interface StateBody {
  isActive: boolean;
  policyEpoch: number;
  blockNumber: string;
  balances: { token: string; symbol: string; amount: string }[];
}

export async function checkApi(report: Report, base: string, client: PublicClient | null, d: Deployment): Promise<void> {
  const api = `${base.replace(/\/$/, "")}/api`;

  // B1: health.
  try {
    const h = await getJson(`${api}/health`);
    const body = h.body as Record<string, unknown>;
    const parts = ["api", "worker", "redis", "postgres", "rpc"];
    const down = parts.filter((p) => body?.[p] !== "up");
    report.add("B1", "GET /api/health", h.status === 200 && down.length === 0 ? pass(parts.map((p) => `${p} up`).join(", ")) : fail(`HTTP ${h.status}; not up: ${down.join(", ") || "?"}`));
    checkHeaders(report, h.headers);
  } catch (err) {
    report.add("B1", "GET /api/health", fail(`no answer from ${api} (${shortError(err)})`));
    return; // nothing else can be checked
  }

  // B5 (CORS): a foreign origin must not be allowed to read the API with the visitor's cookie.
  try {
    const c = await getJson(`${api}/health`, { headers: { Origin: "https://evil.example" } });
    const allow = c.headers.get("access-control-allow-origin");
    report.add("B5", "CORS refuses a foreign origin", !allow ? pass("no Access-Control-Allow-Origin for https://evil.example") : fail(`Access-Control-Allow-Origin: ${allow}`));
  } catch (err) {
    report.add("B5", "CORS refuses a foreign origin", warn(shortError(err)));
  }

  // B2: the registry knows both demo vaults, and only the public one is the sandbox.
  try {
    const v = await getJson(`${api}/v1/vaults`);
    const vaults = ((v.body as { vaults?: { safe: string; isDemo: boolean }[] })?.vaults ?? []);
    const pub = vaults.find((x) => same(x.safe, d.publicSafe));
    const stage = vaults.find((x) => same(x.safe, d.stageSafe));
    report.add(
      "B2",
      "Vault registry",
      pub && stage && pub.isDemo && !stage.isDemo
        ? pass(`${vaults.length} registered; public is the demo vault, stage is private`)
        : fail(`public ${pub ? `isDemo=${pub.isDemo}` : "missing"}, stage ${stage ? `isDemo=${stage.isDemo}` : "missing"}`),
    );
  } catch (err) {
    report.add("B2", "Vault registry", fail(shortError(err)));
  }

  // B3: what the server shows is what the chain says (P1).
  for (const vault of [
    { name: "public", safe: d.publicSafe, module: d.publicModule },
    { name: "stage", safe: d.stageSafe, module: d.stageModule },
  ]) {
    const tag = `[${vault.name}]`;
    if (!client) {
      report.add("B3", `${tag} Server state = chain`, { status: "SKIP", detail: "no RPC to compare with" });
      continue;
    }
    try {
      const verdicts = await compareState(api, client, d, vault);
      for (const [field, v] of verdicts) report.add("B3", `${tag} ${field}`, v);
    } catch (err) {
      report.add("B3", `${tag} Server state = chain`, fail(shortError(err)));
    }
  }

  // B4: the evidence page judges will open.
  try {
    const p = await getJson(`${api}/v1/proof`);
    const proof = p.body as { contracts?: { name: string; verified: boolean }[]; tests?: { passed: boolean; fuzzRuns: number; invariants: string[]; slither: string }; finality?: { samples: number; avgMs: number } };
    const unverified = (proof.contracts ?? []).filter((c) => !c.verified).map((c) => c.name);
    report.add("B4", "/proof contracts", proof.contracts?.length && unverified.length === 0 ? pass(`${proof.contracts.length} verified`) : warn(`not verified: ${unverified.join(", ") || "no contracts listed"}`));
    report.add(
      "B4",
      "/proof contract tests",
      proof.tests?.passed ? pass(`${proof.tests.fuzzRuns.toLocaleString("en-US")} fuzz runs, ${proof.tests.invariants.length} invariants, slither ${proof.tests.slither}`) : fail("tests not passed or not published (proof/tests.json missing from this server?)"),
    );
    report.add(
      "B4",
      "/proof finality samples",
      (proof.finality?.samples ?? 0) > 0 ? pass(`${proof.finality!.samples} agent txs, avg ${(proof.finality!.avgMs / 1000).toFixed(2)} s`) : warn("no agent transaction measured yet: run a rebalance"),
    );
  } catch (err) {
    report.add("B4", "/proof", fail(shortError(err)));
  }
}

async function compareState(api: string, client: PublicClient, d: Deployment, vault: { safe: `0x${string}`; module: `0x${string}` }): Promise<[string, Verdict][]> {
  const read = async () => {
    const [server, isActive, epoch, usdcBal, wavaxBal] = await Promise.all([
      getJson(`${api}/v1/vaults/${vault.safe}/state`),
      client.readContract({ address: vault.module, abi: agentPolicyModuleAbi, functionName: "policy" }).then((p) => p[3]),
      client.readContract({ address: vault.module, abi: agentPolicyModuleAbi, functionName: "policyEpoch" }),
      client.readContract({ address: d.usdc, abi: erc20Abi, functionName: "balanceOf", args: [vault.safe] }),
      client.readContract({ address: d.wavax, abi: erc20Abi, functionName: "balanceOf", args: [vault.safe] }),
    ]);
    if (server.status !== 200) throw new Error(`GET /state HTTP ${server.status}`);
    const s = server.body as StateBody;
    const bal = (token: string) => s.balances.find((b) => same(b.token, token))?.amount ?? "missing";
    return [
      judgeMirror("isActive", String(isActive), String(s.isActive)),
      judgeMirror("policyEpoch", String(epoch), String(s.policyEpoch)),
      judgeMirror("USDC balance", usdcBal.toString(), bal(d.usdc)),
      judgeMirror("WAVAX balance", wavaxBal.toString(), bal(d.wavax)),
    ] as const;
  };
  // A swap can land between the two reads: compare again once before calling it a mismatch.
  let v = await read();
  if (v.some((x) => x.status === "FAIL")) {
    await new Promise((r) => setTimeout(r, 3_000));
    v = await read();
  }
  return [
    ["isActive: server = chain", v[0]],
    ["policyEpoch: server = chain", v[1]],
    ["USDC balance: server = chain", v[2]],
    ["WAVAX balance: server = chain", v[3]],
  ];
}

/** B5: API response headers (helmet). */
function checkHeaders(report: Report, h: Headers): void {
  const missing = [
    ["x-content-type-options", (v: string) => v === "nosniff"],
    ["x-frame-options", (v: string) => v.toUpperCase() === "DENY"],
    ["content-security-policy", (v: string) => v.includes("frame-ancestors 'none'")],
  ].filter(([name, ok]) => !(ok as (v: string) => boolean)(h.get(name as string) ?? "")).map(([name]) => name);
  report.add("B5", "API security headers", missing.length ? fail(`missing or weak: ${missing.join(", ")}`) : pass("nosniff, X-Frame-Options DENY, CSP frame-ancestors 'none'"));
}

/** B6: the web app as served (prod nginx): the page loads, /api is proxied, and the Kill-Switch page cannot be framed. */
export async function checkWeb(report: Report, web: string): Promise<void> {
  const base = web.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(10_000) });
    const html = await res.text();
    report.add("B6", `Web ${base}`, res.status === 200 && html.includes('id="root"') ? pass("index.html served") : fail(`HTTP ${res.status}`));
    const xfo = res.headers.get("x-frame-options");
    report.add("B6", "Web cannot be framed (clickjacking on Kill-Switch)", xfo?.toUpperCase() === "DENY" ? pass("X-Frame-Options DENY") : warn(`X-Frame-Options: ${xfo ?? "missing"} (fine on the Vite dev server, required in prod)`));
    const deep = await fetch(`${base}/vaults/${"0x" + "1".repeat(40)}/settings`, { signal: AbortSignal.timeout(10_000) });
    report.add("B6", "SPA deep link", deep.status === 200 ? pass("a /vaults/... URL serves the app") : fail(`HTTP ${deep.status} on a deep link`));
    const h = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(10_000) });
    report.add("B6", "/api through the web origin", h.status === 200 ? pass("proxied") : fail(`HTTP ${h.status}`));
  } catch (err) {
    report.add("B6", `Web ${base}`, fail(shortError(err)));
  }
}
