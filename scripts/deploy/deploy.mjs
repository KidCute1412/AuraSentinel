#!/usr/bin/env node
// L4 deploy orchestrator: one reusable entry point for the Fuji deploy (and the same sequence on an Anvil fork).
//
//   node scripts/deploy/deploy.mjs doctor [--network fuji|fork]     read-only preflight, no signing
//   node scripts/deploy/deploy.mjs run    [--network fuji|fork] [--from 1..4] [--yes] [--remember-password]
//   node scripts/deploy/deploy.mjs verify                           Snowtrace verification from deployments/fuji.json
//   node scripts/deploy/deploy.mjs wire                             write addresses into apps/server/.env
//   node scripts/deploy/deploy.mjs status [--network ...]           print addresses + explorer links
//
// Key rule (P5): the owner/deployer and agent keys are NEVER read or stored here. On Fuji every transaction is signed
// by Foundry from the owner's own keystore (`cast wallet import deployer|agent --interactive`). The fork network uses
// Anvil's public dev keys, the same ones CI uses in the `deploy-dry-run` job.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTRACTS = join(ROOT, 'packages', 'contracts');
const ZERO = '0x0000000000000000000000000000000000000000';

// Anvil's public dev accounts #0 and #1 (see .gitleaks.toml and ci.yml). Worthless outside a local fork.
const ANVIL_OWNER = { key: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' };
const ANVIL_AGENT = { key: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' };

const NETWORKS = {
  fuji: { name: 'fuji', chainId: 43113, rpc: 'https://api.avax-test.network/ext/bc/C/rpc', explorer: 'https://testnet.snowtrace.io' },
  fork: { name: 'fork', chainId: 43113, rpc: 'http://127.0.0.1:8545', explorer: null },
};

// ---------------------------------------------------------------- args
const [cmd = 'help', ...rest] = process.argv.slice(2);
const opts = {
  network: 'fuji', from: 1, yes: false, remember: false, fresh: false, rpc: null, owner: 'deployer', agent: 'agent',
  ownerAddress: process.env.DEPLOY_OWNER_ADDRESS, agentAddress: process.env.DEPLOY_AGENT_ADDRESS,
};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === '--network') opts.network = rest[++i];
  else if (a === '--from') opts.from = Number(rest[++i]);
  else if (a === '--rpc') opts.rpc = rest[++i];
  else if (a === '--owner-address') opts.ownerAddress = rest[++i];
  else if (a === '--agent-address') opts.agentAddress = rest[++i];
  else if (a === '--owner-account') opts.owner = rest[++i];
  else if (a === '--agent-account') opts.agent = rest[++i];
  else if (a === '--yes') opts.yes = true;
  else if (a === '--remember-password') opts.remember = true;
  else if (a === '--fresh') opts.fresh = true;
  else die(`Unknown option ${a}. Run: node scripts/deploy/deploy.mjs help`);
}
const net = NETWORKS[opts.network];
if (!net) die(`--network must be fuji or fork (got ${opts.network})`);
if (opts.rpc) net.rpc = opts.rpc;
const isFork = net.name === 'fork';
const depFile = join(CONTRACTS, 'deployments', `${net.name}.json`);

// ---------------------------------------------------------------- helpers
function die(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}
const sh = (c, args, o = {}) =>
  spawnSync(c, args, { cwd: CONTRACTS, encoding: 'utf8', env: { ...process.env, ...(o.env ?? {}) }, stdio: o.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
const out = (r) => `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
const have = (tool) => {
  const r = sh(tool, ['--version']);
  return r.status === 0 ? out(r).split('\n')[0] : null;
};
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const readDep = () => (existsSync(depFile) ? JSON.parse(readFileSync(depFile, 'utf8')) : null);
const isSet = (v) => typeof v === 'string' && v !== ZERO && v !== '';
const link = (addr) => (net.explorer ? `${net.explorer}/address/${addr}` : '(local fork)');

const keystoreFile = (name) => join(process.env.FOUNDRY_KEYSTORE_DIR ?? join(homedir(), '.foundry', 'keystores'), name);
const isAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(a ?? '');

/** Public address of an account. Foundry keystores usually do NOT store it, so it comes from --owner-address /
 *  --agent-address (or DEPLOY_OWNER_ADDRESS / DEPLOY_AGENT_ADDRESS); the keystore `address` field is a fallback. */
function accountAddress(name, explicit) {
  if (isAddress(explicit)) return explicit;
  try {
    const a = JSON.parse(readFileSync(keystoreFile(name), 'utf8')).address;
    if (a) return `0x${a.replace(/^0x/, '')}`;
  } catch {
    /* no keystore or unreadable */
  }
  return null;
}
const accounts = () =>
  isFork
    ? { owner: ANVIL_OWNER.address, agent: ANVIL_AGENT.address }
    : { owner: accountAddress(opts.owner, opts.ownerAddress), agent: accountAddress(opts.agent, opts.agentAddress) };

const balanceAvax = (addr) => {
  const r = sh('cast', ['balance', addr, '--ether', '--rpc-url', net.rpc]);
  return r.status === 0 ? Number(out(r)) : null;
};

// ---------------------------------------------------------------- doctor
function doctor() {
  const checks = [];
  const add = (ok, label, detail = '') => checks.push({ ok, label, detail });

  for (const t of ['forge', 'cast', 'anvil']) {
    const v = have(t);
    add(!!v, `${t} installed`, v ?? 'missing: install Foundry (curl -L https://foundry.paradigm.xyz | bash && foundryup)');
  }
  const foundryOk = checks.every((c) => c.ok);
  add(existsSync(join(CONTRACTS, 'lib', 'forge-std', 'src', 'Script.sol')), 'forge-std submodule', 'if missing: git submodule update --init');

  if (foundryOk) {
    const b = sh('forge', ['build']);
    add(b.status === 0, 'forge build', b.status === 0 ? 'compiles' : out(b).split('\n').slice(-5).join(' | '));

    if (!isFork) {
      const id = sh('cast', ['chain-id', '--rpc-url', net.rpc]);
      const ok = id.status === 0 && Number(out(id)) === net.chainId;
      add(ok, `RPC reachable, chainId ${net.chainId}`, ok ? net.rpc : `got "${out(id).slice(0, 80)}"`);
      const code = sh('cast', ['code', '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901', '--rpc-url', net.rpc]);
      add(code.status === 0 && out(code).length > 4, 'Trader Joe router has code on this chain');
    }
  }

  const { owner, agent } = accounts();
  if (!isFork) {
    const ks = (name) => existsSync(keystoreFile(name));
    add(ks(opts.owner), `keystore "${opts.owner}" (owner/deployer)`, ks(opts.owner) ? 'found' : `missing: cast wallet import ${opts.owner} --interactive`);
    add(ks(opts.agent), `keystore "${opts.agent}" (agent session key)`, ks(opts.agent) ? 'found' : `missing: cast wallet import ${opts.agent} --interactive`);
    add(!!owner, 'owner public address known', owner ?? 'pass --owner-address 0x... (get it: cast wallet address --account deployer)');
    add(!!agent, 'agent public address known', agent ?? 'pass --agent-address 0x... (get it: cast wallet address --account agent)');
    if (owner && agent) add(owner.toLowerCase() !== agent.toLowerCase(), 'owner and agent are different wallets', 'the agent key must not be the owner key');
    if (foundryOk && owner) {
      const bal = balanceAvax(owner);
      add(bal !== null && bal >= 0.4, 'owner AVAX >= 0.4 (deploy needs ~0.22 at 25 gwei)', bal === null ? 'cannot read balance' : `${bal} AVAX (${owner})`);
    }
    if (foundryOk && agent) {
      const bal = balanceAvax(agent);
      add(bal !== null && bal >= 0.02, 'agent AVAX >= 0.02 (2 swaps need ~0.01)', bal === null ? 'cannot read balance' : `${bal} AVAX (${agent})`);
    }
  }

  const d = readDep();
  add(true, `deployments/${net.name}.json`, d ? 'exists (steps with addresses will be skipped)' : 'not created yet (fresh deploy)');

  console.log(`\nAgentShield L4 doctor, network: ${net.name}\n`);
  for (const c of checks) console.log(`${c.ok ? '  PASS' : '  FAIL'}  ${c.label}${c.detail ? `  ${c.detail}` : ''}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed ? `\n${failed} check(s) failed. Fix them, then re-run doctor.\n` : '\nAll checks passed.\n');
  return failed === 0;
}

// ---------------------------------------------------------------- password handling
const tempFiles = [];
process.on('exit', () => tempFiles.forEach((f) => rmSync(f, { force: true, recursive: true })));
process.on('SIGINT', () => process.exit(130));

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    if (!stdin.isTTY) return die('--remember-password needs an interactive terminal');
    let buf = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(buf);
        }
        if (c === '\u0003') process.exit(130);
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

/** Optional: ask each keystore password once and hand Foundry a short-lived file (deleted on exit). Off by default. */
async function passwordFiles() {
  if (isFork || !opts.remember) return {};
  const dir = mkdtempSync(join(tmpdir(), 'agentshield-'));
  tempFiles.push(dir);
  const files = {};
  for (const name of [opts.owner, opts.agent]) {
    const pw = await askHidden(`Password for keystore "${name}": `);
    const f = join(dir, name);
    writeFileSync(f, pw, { mode: 0o600 });
    files[name] = f;
  }
  return files;
}

// ---------------------------------------------------------------- run
let anvilProc = null;
function startAnvil() {
  if (!isFork) return;
  const probe = sh('cast', ['chain-id', '--rpc-url', net.rpc]);
  if (probe.status === 0) {
    console.log('Anvil already running on', net.rpc);
    return;
  }
  console.log('Starting Anvil fork of Fuji ...');
  anvilProc = spawn('anvil', ['--fork-url', NETWORKS.fuji.rpc, '--chain-id', '43113', '--port', '8545'], { stdio: 'ignore' });
  process.on('exit', () => anvilProc?.kill());
  for (let i = 0; i < 30; i++) {
    if (sh('cast', ['block-number', '--rpc-url', net.rpc]).status === 0) return;
    sleep(2000);
  }
  die('Anvil fork did not start in 60s');
}

function forgeScript(script, who, extraEnv, pwFiles) {
  const signer = isFork
    ? ['--private-key', who === 'agent' ? ANVIL_AGENT.key : ANVIL_OWNER.key]
    : ['--account', who === 'agent' ? opts.agent : opts.owner, ...(pwFiles[who === 'agent' ? opts.agent : opts.owner] ? ['--password-file', pwFiles[who === 'agent' ? opts.agent : opts.owner]] : [])];
  const args = ['script', `script/${script}`, '--rpc-url', net.rpc, ...signer, '--broadcast', '--slow'];
  const { agent } = accounts();
  const r = sh('forge', args, { inherit: true, env: { DEPLOYMENT: net.name, AGENT_ADDRESS: agent, ...extraEnv } });
  if (r.status !== 0) die(`${script} failed. Fix the cause, then continue with: node scripts/deploy/deploy.mjs run --network ${net.name} --from <step>`);
}

async function run() {
  if (isFork && opts.fresh) rmSync(depFile, { force: true });
  if (isFork) startAnvil();
  if (!doctor()) die('Preflight failed, nothing was signed.');

  const { owner, agent } = accounts();
  console.log(`About to deploy to ${net.name} (chainId ${net.chainId}).\n  owner/deployer: ${owner}\n  agent:          ${agent}`);
  if (!isFork && !opts.yes) {
    const answer = await new Promise((res) => {
      process.stdout.write('Type "deploy" to sign and send transactions: ');
      process.stdin.once('data', (d) => res(String(d).trim()));
    });
    process.stdin.pause();
    if (answer !== 'deploy') die('Aborted, nothing was signed.');
  }

  const pw = await passwordFiles();
  let did = false;
  const step = (n, label, done, fn) => {
    if (opts.from > n) return console.log(`- step ${n} ${label}: skipped (--from ${opts.from})`);
    if (done()) return console.log(`- step ${n} ${label}: already done, skipped`);
    console.log(`\n== step ${n}: ${label}`);
    fn();
    did = true;
  };
  const d0 = () => readDep() ?? {};

  step(1, 'MockUSDC + MockWAVAX + factory', () => isSet(d0().usdc), () => forgeScript('Deploy.s.sol', 'owner', {}, pw));
  step(2, 'Trader Joe pool', () => isSet(d0().pair), () => forgeScript('SetupPool.s.sol', 'owner', {}, pw));
  step(3, 'public vault', () => isSet(d0().publicSafe), () => forgeScript('CreateVault.s.sol', 'owner', { VAULT: 'public' }, pw));
  step(3, 'stage vault', () => isSet(d0().stageSafe), () => forgeScript('CreateVault.s.sol', 'owner', { VAULT: 'stage' }, pw));

  if (opts.from === 4 || did) {
    for (const v of ['public', 'stage']) {
      console.log(`\n== step 4: guarded swap signed by the agent (${v} vault)`);
      forgeScript('ManualSwap.s.sol', 'agent', { VAULT: v }, pw);
    }
  } else {
    console.log('- step 4 manual swap: skipped (nothing new was deployed; use --from 4 to repeat it)');
  }

  console.log('\nDeploy finished.');
  status();
  if (!isFork) console.log('Next: node scripts/deploy/deploy.mjs verify   then   node scripts/deploy/deploy.mjs wire\n');
}

// ---------------------------------------------------------------- status
function status() {
  const d = readDep();
  if (!d) return console.log(`No deployments/${net.name}.json yet.`);
  const rows = [
    ['MockUSDC', d.usdc], ['MockWAVAX', d.wavax], ['AgentShieldFactory', d.factory], ['Pool (USDC/WAVAX)', d.pair],
    ['Public Safe', d.publicSafe], ['Public Module', d.publicModule], ['Stage Safe', d.stageSafe], ['Stage Module', d.stageModule],
    ['Agent (session key)', d.agent],
  ];
  console.log(`\nDeployment: ${net.name}  (chainId ${d.chainId})`);
  for (const [name, a] of rows) console.log(`  ${name.padEnd(20)} ${isSet(a) ? a : '-'}   ${isSet(a) ? link(a) : ''}`);
  console.log('');
}

// ---------------------------------------------------------------- verify
/** Value of a `uint256 internal constant NAME = 1_000_000e6;` or `... = 1 hours;` in Deploy.s.sol. */
function solConstant(src, name) {
  const m = src.match(new RegExp(`${name}\\s*=\\s*([^;]+);`));
  if (!m) die(`Cannot find constant ${name} in Deploy.s.sol`);
  const e = m[1].trim().replace(/_/g, '');
  let t = e.match(/^(\d+)e(\d+)$/);
  if (t) return (BigInt(t[1]) * 10n ** BigInt(t[2])).toString();
  t = e.match(/^(\d+)$/);
  if (t) return t[1];
  t = e.match(/^(\d+)\s*hours$/);
  if (t) return (BigInt(t[1]) * 3600n).toString();
  return die(`Unsupported constant expression for ${name}: ${m[1]}`);
}

function verify() {
  if (isFork) die('verify only applies to --network fuji');
  const d = readDep();
  if (!d) die('deployments/fuji.json not found. Run the deploy first.');
  if (!have('forge')) die('forge not installed');
  const src = readFileSync(join(CONTRACTS, 'script', 'Deploy.s.sol'), 'utf8');
  const cooldown = solConstant(src, 'COOLDOWN');
  const tokenArgs = (supply, faucet) => sh('cast', ['abi-encode', 'f(uint256,uint256,uint256)', supply, faucet, cooldown]).stdout.trim();
  const usdcArgs = tokenArgs(solConstant(src, 'USDC_SUPPLY'), solConstant(src, 'USDC_FAUCET'));
  const wavaxArgs = tokenArgs(solConstant(src, 'WAVAX_SUPPLY'), solConstant(src, 'WAVAX_FAUCET'));
  const ownerOf = (module) => out(sh('cast', ['call', module, 'owner()(address)', '--rpc-url', net.rpc]));
  const modArgs = (safe, module) => sh('cast', ['abi-encode', 'f(address,address)', safe, ownerOf(module)]).stdout.trim();

  const targets = [
    ['MockUSDC', d.usdc, 'src/MockUSDC.sol:MockUSDC', usdcArgs],
    ['MockWAVAX', d.wavax, 'src/MockWAVAX.sol:MockWAVAX', wavaxArgs],
    ['AgentShieldFactory', d.factory, 'src/AgentShieldFactory.sol:AgentShieldFactory', null],
    ['Public module', d.publicModule, 'src/AgentPolicyModule.sol:AgentPolicyModule', modArgs(d.publicSafe, d.publicModule)],
    ['Stage module', d.stageModule, 'src/AgentPolicyModule.sol:AgentPolicyModule', modArgs(d.stageSafe, d.stageModule)],
  ];
  let bad = 0;
  for (const [name, addr, id, ctor] of targets) {
    if (!isSet(addr)) { console.log(`- ${name}: no address, skipped`); continue; }
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      console.log(`\n== verify ${name} ${addr} (attempt ${attempt})`);
      const args = ['verify-contract', addr, id, '--chain', 'fuji', '--watch', ...(ctor ? ['--constructor-args', ctor] : [])];
      const r = sh('forge', args, { inherit: false });
      const text = out(r);
      console.log(text.split('\n').slice(-6).join('\n'));
      ok = r.status === 0 || /already verified/i.test(text);
      if (!ok && attempt < 3) sleep(8000);
    }
    if (!ok) bad++;
    console.log(ok ? `  verified: ${link(addr)}#code` : `  FAILED: ${name}`);
  }
  if (bad) die(`${bad} contract(s) not verified. Re-run verify (it skips nothing, already-verified ones pass).`);
  console.log('\nAll contracts verified on Snowtrace.\n');
}

// ---------------------------------------------------------------- wire
function setEnv(text, key, value) {
  const re = new RegExp(`^#?\\s*${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  return re.test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line).replace(new RegExp(`^#\\s*${key}=.*$`, 'm'), line) : `${text.trimEnd()}\n${line}\n`;
}

function deployBlock() {
  const f = join(CONTRACTS, 'broadcast', 'Deploy.s.sol', String(net.chainId), 'run-latest.json');
  if (!existsSync(f)) return '';
  try {
    const rec = JSON.parse(readFileSync(f, 'utf8')).receipts ?? [];
    const blocks = rec.map((r) => Number(r.blockNumber)).filter(Number.isFinite);
    return blocks.length ? String(Math.min(...blocks)) : '';
  } catch {
    return '';
  }
}

function wire() {
  if (isFork) die('wire only applies to --network fuji');
  const d = readDep();
  if (!d || !isSet(d.publicSafe)) die('deployments/fuji.json has no public vault yet. Run the deploy first.');
  const envPath = join(ROOT, 'apps', 'server', '.env');
  const example = join(ROOT, 'apps', 'server', '.env.example');
  let text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : existsSync(example) ? readFileSync(example, 'utf8') : '';
  const values = {
    SAFE_ADDRESS: d.publicSafe, POLICY_MODULE_ADDRESS: d.publicModule, TOKEN_A_ADDRESS: d.usdc, TOKEN_B_ADDRESS: d.wavax, FACTORY_ADDRESS: d.factory,
  };
  const block = deployBlock();
  if (block) values.INDEXER_START_BLOCK = block;
  for (const [k, v] of Object.entries(values)) text = setEnv(text, k, v);
  writeFileSync(envPath, text);
  console.log('\nUpdated apps/server/.env:');
  for (const [k, v] of Object.entries(values)) console.log(`  ${k}=${v}`);
  console.log('\nNot touched: AGENT_PRIVATE_KEY. Put the AGENT (session) key there yourself; never the owner key.');
  console.log('Remember to commit packages/contracts/deployments/fuji.json.\n');
}

// ---------------------------------------------------------------- main
function help() {
  console.log(`AgentShield L4 deploy orchestrator

  doctor  [--network fuji|fork]        preflight, read-only
  run     [--network fuji|fork] [--from N] [--yes] [--remember-password] [--fresh]
          steps: 1 tokens+factory, 2 pool, 3 vaults, 4 agent swap. Re-run safely: finished steps are skipped.
  verify                               verify the 5 contracts on Snowtrace (Fuji)
  wire                                 write addresses into apps/server/.env
  status  [--network fuji|fork]        addresses + explorer links

Options: --owner-account NAME (default deployer), --agent-account NAME (default agent), --rpc URL
Fuji signing uses your Foundry keystore (cast wallet import <name> --interactive). Keys are never stored by this tool.
--remember-password asks each keystore password once and gives Foundry a temp file that is deleted on exit.
`);
}

const commands = { doctor: () => process.exit(doctor() ? 0 : 1), run, verify, wire, status, help };
if (!commands[cmd]) die(`Unknown command "${cmd}". Run: node scripts/deploy/deploy.mjs help`);
await commands[cmd]();
