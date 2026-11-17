/**
 * pnpm seed --verify [--api <origin>] [--web <origin>] [--env <file>] [--json]
 *
 * Read-only preflight for the demo (L10, D7): checks the Fuji deployment straight from the chain (section A) and,
 * with --api, that the running server mirrors it and is configured safely (section B). It never signs, never sets
 * a policy and never reads a private key. Exit code 1 on any FAIL.
 *
 *   pnpm seed --verify                                   chain only
 *   pnpm seed --verify --api http://localhost:4000       + dev server
 *   pnpm seed --verify --api http://localhost:8080 --web http://localhost:8080 --env infra/.env.prod   prod compose
 *
 * The RPC list and AGENT_MIN_GAS_WEI come from --env (default apps/server/.env): only those two keys are read.
 * Seeding itself (mint, liquidity, fund, setPolicy) is done by the signed Foundry scripts: scripts/deploy/deploy.mjs.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkApi, checkWeb } from "./seed/api.ts";
import { checkDeployment, checkRpcs, checkVerified, parseDeployment } from "./seed/chain.ts";
import { Report } from "./seed/report.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RPC = "https://api.avax-test.network/ext/bc/C/rpc";
const DEFAULT_MIN_GAS_WEI = 20_000_000_000_000_000n; // server default: 0.02 AVAX

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Only the two public settings this script needs, never anything else from the file (keys stay unread). */
function readEnv(file: string): { rpcs: string[]; minGas: bigint } {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    console.warn(`(no ${file}: using the public Fuji RPC and the default gas floor)`);
  }
  const value = (key: string) => text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
  const rpcs = (process.env.FUJI_RPC_URLS ?? value("FUJI_RPC_URLS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const gas = process.env.AGENT_MIN_GAS_WEI ?? value("AGENT_MIN_GAS_WEI");
  return { rpcs: rpcs.length ? rpcs : [DEFAULT_RPC], minGas: gas && /^\d+$/.test(gas) ? BigInt(gas) : DEFAULT_MIN_GAS_WEI };
}

async function main() {
  if (!process.argv.includes("--verify")) {
    console.error("Only --verify exists: seeding is done by the signed Foundry scripts (node scripts/deploy/deploy.mjs).");
    process.exit(2);
  }
  const json = process.argv.includes("--json");
  const report = new Report(json);
  const envFile = resolve(ROOT, arg("--env") ?? "apps/server/.env");
  const env = readEnv(envFile);
  const deployment = parseDeployment(JSON.parse(readFileSync(join(ROOT, "packages/contracts/deployments/fuji.json"), "utf8")));

  report.section("A. Fuji deployment (read from the chain)");
  const client = await checkRpcs(report, env.rpcs);
  if (client) {
    await checkDeployment(report, client, deployment, env.minGas);
    await checkVerified(report, deployment);
  }

  const api = arg("--api");
  if (api) {
    report.section(`B. Server ${api}`);
    await checkApi(report, api, client, deployment);
  }
  const web = arg("--web");
  if (web) await checkWeb(report, web);

  if (json) console.log(JSON.stringify({ summary: report.summary(), checks: report.checks }, null, 2));
  else console.log(`\n${report.failed ? "FAIL" : "PASS"}: ${report.summary()}`);
  process.exit(report.failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
