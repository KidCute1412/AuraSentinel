#!/usr/bin/env node
// Runs the full contract test suite at demo strength and writes proof/tests.json, the artifact GET /proof serves
// (apps/server PROOF_TESTS_FILE). Every number in it is what this run measured; nothing is typed in by hand.
//
//   pnpm --filter @agentshield/contracts proof            # 10,000 fuzz runs, 1,000 x 100 invariant runs
//   FUZZ_RUNS=1000 INVARIANT_RUNS=256 node script/proof-artifact.mjs   # quicker
//   node script/proof-artifact.mjs --check   # CI: the committed artifact passed and is about the current src/
//
// Slither is summarised from ./slither.json when present (`slither . --json slither.json`, or the CI step);
// it is only trusted when src/ has no uncommitted change and the report is newer than src/'s last commit, otherwise
// it is reported as "not run".
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS ?? 10_000);
const INVARIANT_RUNS = Number(process.env.INVARIANT_RUNS ?? 1_000);
const INVARIANT_DEPTH = Number(process.env.INVARIANT_DEPTH ?? 100);
const OUT = join(root, "proof", "tests.json");

const listSol = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listSol(join(dir, e.name)) : e.name.endsWith(".sol") ? [join(dir, e.name)] : []));

/** sha256 over src/*.sol in path order, line endings normalised so Windows and Linux checkouts agree. */
function srcSha256() {
  const h = createHash("sha256");
  const files = listSol(join(root, "src")).map((f) => ({ f, key: f.slice(root.length).replace(/\\/g, "/") }));
  for (const { f, key } of files.sort((a, b) => (a.key < b.key ? -1 : 1))) {
    h.update(key);
    h.update(readFileSync(f, "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex");
}

if (process.argv.includes("--check")) {
  const a = JSON.parse(readFileSync(OUT, "utf8"));
  const problems = [];
  if (a.passed !== true) problems.push("the committed run did not pass");
  if (a.srcSha256 !== srcSha256()) problems.push("src/ changed since the artifact was made");
  if (problems.length) {
    console.error(`proof/tests.json is stale: ${problems.join("; ")}. Run: pnpm --filter @agentshield/contracts proof`);
    process.exit(1);
  }
  console.log(`proof/tests.json is current (${a.fuzzRuns} fuzz runs, ${a.invariants.length} invariants, slither: ${a.slither})`);
  process.exit(0);
}

// ---- forge
console.log(`forge test: ${FUZZ_RUNS} fuzz runs, invariants ${INVARIANT_RUNS} runs x depth ${INVARIANT_DEPTH} ...`);
const forge = spawnSync("forge", ["test", "--fuzz-runs", String(FUZZ_RUNS), "--json"], {
  cwd: root,
  env: { ...process.env, FOUNDRY_PROFILE: "default", FOUNDRY_INVARIANT_RUNS: String(INVARIANT_RUNS), FOUNDRY_INVARIANT_DEPTH: String(INVARIANT_DEPTH) },
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
  shell: process.platform === "win32",
});
if (forge.error) throw forge.error;
const jsonStart = forge.stdout.indexOf("{");
if (jsonStart < 0) {
  console.error(forge.stdout, forge.stderr);
  throw new Error("forge printed no JSON (did it compile?)");
}
const suites = JSON.parse(forge.stdout.slice(jsonStart));
const results = Object.values(suites).flatMap((s) => Object.entries(s.test_results));
// Opt-in suites (the Fuji fork test) report "Skipped"; only a "Failure" counts against the run.
const failed = results.filter(([, r]) => r.status === "Failure").map(([name]) => name);
const skipped = results.filter(([, r]) => r.status === "Skipped").length;
const fuzzTests = results.filter(([, r]) => "Fuzz" in r.kind).map(([name]) => name);
const invariantCalls = results.reduce((n, [, r]) => n + ("Invariant" in r.kind ? r.kind.Invariant.calls : 0), 0);

// forge's JSON folds an invariant suite into one entry, so the names come from the source.
const invariantFiles = listSol(join(root, "test", "invariant"));
const invariants = invariantFiles.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/function (invariant_\w+)\s*\(/g)].map((m) => m[1]));
const passed = forge.status === 0 && failed.length === 0 && invariants.length > 0;

// ---- slither
const srcFiles = listSol(join(root, "src"));
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: process.platform === "win32" }).stdout?.trim() ?? "";
// File mtimes change on checkout; git knows when the source last really changed.
const srcDirty = run("git", ["status", "--porcelain", "--", "src"]) !== "";
const srcCommittedMs = Number(run("git", ["log", "-1", "--format=%ct", "--", "src"])) * 1000;
let slither = "not run";
let slitherFindings = null;
try {
  const path = join(root, "slither.json");
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (srcDirty || !(statSync(path).mtimeMs > srcCommittedMs)) {
    console.warn("slither.json does not cover the current src/: reported as not run. Re-run slither.");
  } else if (report.success) {
    const count = (impact) => report.results.detectors.filter((d) => d.impact === impact).length;
    slitherFindings = Object.fromEntries(["High", "Medium", "Low", "Informational"].map((i) => [i.toLowerCase(), count(i)]));
    slither = `${slitherFindings.high} high, ${slitherFindings.medium} medium, ${slitherFindings.low} low`;
  }
} catch {
  // no report: "not run"
}

// ---- provenance: which source these results are about (the --check mode compares it with src/)

const artifact = {
  fuzzRuns: FUZZ_RUNS,
  invariants,
  passed,
  slither,
  // Extra detail; the server keeps only the four fields above (parseTestsArtifact).
  invariantRuns: INVARIANT_RUNS,
  invariantDepth: INVARIANT_DEPTH,
  invariantCalls,
  fuzzTests,
  tests: { total: results.length, skipped, failed },
  slitherFindings,
  srcSha256: srcSha256(),
  commit: run("git", ["rev-parse", "--short", "HEAD"]) || null,
  generatedAt: new Date().toISOString(),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`${passed ? "PASS" : "FAIL"}: ${results.length} tests, ${invariants.length} invariants (${invariantCalls} calls), slither: ${slither}`);
console.log(`wrote ${OUT}`);
process.exit(passed ? 0 : 1);
