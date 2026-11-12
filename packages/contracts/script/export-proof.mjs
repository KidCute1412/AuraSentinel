#!/usr/bin/env node
// L5: runs the whole Foundry suite at 10,000 fuzz runs and writes ../proof/tests.json, the `tests` block of
// GET /proof (docs/architecture/api.md section 14). The file is committed; CI re-runs this with --check and fails
// when the stable fields drift (same idea as abi/).
//
//   node script/export-proof.mjs --slither slither.json           write proof/tests.json
//   node script/export-proof.mjs --slither slither.json --check   compare with the committed file, write nothing
//
// --slither takes the JSON report of `slither . --json <file>`; only findings in src/ are counted.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FUZZ_RUNS = 10_000;
/** Compared by --check. Everything else (timestamps, tool versions) may change freely. */
const STABLE_KEYS = ['fuzzRuns', 'invariants', 'passed', 'slither', 'totals', 'invariantConfig'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'proof', 'tests.json');

const args = process.argv.slice(2);
const check = args.includes('--check');
const slitherIdx = args.indexOf('--slither');
const slitherPath = slitherIdx >= 0 ? args[slitherIdx + 1] : undefined;

function fail(msg) {
  console.error(`export-proof: ${msg}`);
  process.exit(1);
}

if (!slitherPath) fail('missing --slither <report.json> (run `slither . --json slither.json` first)');
if (!existsSync(slitherPath)) fail(`Slither report not found: ${slitherPath}`);

// ------------------------------------------------------------------ forge test

console.log(`forge test --fuzz-runs ${FUZZ_RUNS} --json ...`);
const run = spawnSync('forge', ['test', '--fuzz-runs', String(FUZZ_RUNS), '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 512 * 1024 * 1024,
  shell: process.platform === 'win32',
});
if (run.error) fail(`cannot run forge: ${run.error.message}`);

// Forge prints one JSON object; be tolerant of anything printed before it.
const start = run.stdout.indexOf('{');
if (start < 0) fail(`forge printed no JSON (exit ${run.status}):\n${run.stderr || run.stdout}`);
let suites;
try {
  suites = JSON.parse(run.stdout.slice(start));
} catch (e) {
  fail(`cannot parse forge JSON: ${e.message}\n${run.stderr}`);
}

let total = 0;
let passedCount = 0;
const failed = [];
const invariants = [];
const lowFuzz = [];
let invariantRunsMin = Infinity;

for (const [suite, result] of Object.entries(suites)) {
  for (const [name, t] of Object.entries(result.test_results ?? {})) {
    total += 1;
    if (t.status === 'Success') passedCount += 1;
    else failed.push(`${suite} :: ${name}: ${t.reason ?? t.status}`);

    const kind = t.kind ?? {};
    if (kind.Fuzz && kind.Fuzz.runs < FUZZ_RUNS) lowFuzz.push(`${name} (${kind.Fuzz.runs} runs)`);
    if (kind.Invariant) {
      invariants.push(name.replace(/\(.*$/, '').replace(/^invariant_/, ''));
      invariantRunsMin = Math.min(invariantRunsMin, kind.Invariant.runs);
    }
  }
}

if (total === 0) fail('forge reported no tests');
if (failed.length) {
  console.error(`${failed.length} test(s) failed:\n  ${failed.join('\n  ')}`);
  console.error('Re-run with `forge test -vvv --match-test <name>` for the trace.');
  process.exit(1);
}
if (lowFuzz.length) fail(`fuzz tests below ${FUZZ_RUNS} runs (vm.assume rejecting too much?):\n  ${lowFuzz.join('\n  ')}`);
if (invariants.length === 0) fail('no invariant tests found');
invariants.sort();

// ------------------------------------------------------------------ slither

const report = JSON.parse(readFileSync(slitherPath, 'utf8'));
const detectors = report?.results?.detectors ?? [];
const inSrc = (d) =>
  (d.elements ?? []).some((e) => (e.source_mapping?.filename_relative ?? '').replace(/\\/g, '/').match(/(^|\/)src\//));
const counts = { High: 0, Medium: 0, Low: 0 };
for (const d of detectors) if (d.impact in counts && inSrc(d)) counts[d.impact] += 1;
const slither = `${counts.High} high, ${counts.Medium} medium, ${counts.Low} low`;

// ------------------------------------------------------------------ write / check

const foundryToml = readFileSync(join(root, 'foundry.toml'), 'utf8');
const depth = Number(/\[profile\.default\.invariant\][^[]*?depth\s*=\s*(\d+)/.exec(foundryToml)?.[1] ?? NaN);

const proof = {
  fuzzRuns: FUZZ_RUNS,
  invariants,
  passed: true,
  slither,
  totals: { tests: total, passed: passedCount, failed: 0 },
  invariantConfig: { runs: invariantRunsMin, depth },
  forgeVersion: execFileSync('forge', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' })
    .split('\n')[0]
    .trim(),
  generatedAt: new Date().toISOString(),
};

const pick = (o) => JSON.stringify(Object.fromEntries(STABLE_KEYS.map((k) => [k, o?.[k]])));

if (check) {
  if (!existsSync(outFile)) fail('proof/tests.json is missing: run `pnpm --filter @agentshield/contracts proof`');
  const committed = JSON.parse(readFileSync(outFile, 'utf8'));
  if (pick(committed) !== pick(proof)) {
    console.error(`committed: ${pick(committed)}\nfresh:     ${pick(proof)}`);
    fail('proof/tests.json is out of date: regenerate it and commit');
  }
  console.log(`proof/tests.json up to date (${total} tests, invariants: ${invariants.join(', ')}; Slither ${slither})`);
} else {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(`proof/tests.json  <-  ${total} tests, invariants: ${invariants.join(', ')}; Slither ${slither}`);
}
