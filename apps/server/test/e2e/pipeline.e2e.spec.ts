/**
 * End-to-end (A10): the real API + worker, in process, against the real contracts deployed on an
 * Anvil fork of Fuji by the L4 scripts. This is T1 (Milestone A) as a test:
 *   POST rebalance -> precheck (live chain) -> Anvil sim -> invariants -> broadcast -> confirmed,
 *   allowance back to 0, attacks blocked by the right shield, indexer + SSE + /proof consistent.
 *
 * Skipped unless E2E_DEPLOYMENT points at a deployments/*.json written by the L4 scripts. Needs:
 *   E2E_DEPLOYMENT   path to fork.json (publicSafe, publicModule, usdc, wavax, factory, router)
 *   E2E_CHAIN_URL    the chain the contracts live on (Anvil fork of Fuji)            [8545]
 *   E2E_SIM_URL      a second Anvil forking E2E_CHAIN_URL, used by the simulator     [8546]
 *   DATABASE_URL, REDIS_URL
 * CI: job `integration`. Locally: docs/runbook/production.md §5, then
 *   E2E_DEPLOYMENT=../../packages/contracts/deployments/fork.json pnpm --filter server test:integration
 * Never point it at real Fuji: it moves the chain clock with evm_increaseTime.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { createPublicClient, http, parseAbi, type Address, type PublicClient } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DEPLOYMENT = process.env.E2E_DEPLOYMENT;
const CHAIN_URL = process.env.E2E_CHAIN_URL ?? 'http://127.0.0.1:8545';
const SIM_URL = process.env.E2E_SIM_URL ?? 'http://127.0.0.1:8546';
/** Anvil dev account #1 (public, test only): the agent session key in the L4 dry run. */
const AGENT_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ERC20 = parseAbi(['function allowance(address owner, address spender) view returns (uint256)']);
const TERMINAL = ['confirmed', 'rejected', 'reverted', 'failed'];
/**
 * Boots the compiled app (nest build), not the TS sources: vitest's esbuild drops decorator
 * metadata, which Nest DI needs. It is also exactly the code the Docker image runs.
 */
const DIST = join(__dirname, '..', '..', 'dist');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fromDist = <T>(path: string): T => require(join(DIST, path)) as T;

interface Deployment {
  publicSafe: Address;
  publicModule: Address;
  usdc: Address;
  wavax: Address;
  factory: Address;
  router: Address;
}

type Json = Record<string, unknown>;

describe.skipIf(!DEPLOYMENT)('e2e: rebalance and attacks through the whole pipeline', () => {
  let d: Deployment;
  let chain: PublicClient;
  let api: INestApplication;
  let worker: INestApplicationContext;
  let base: string;
  const sse: Json[] = [];
  /** Swaps confirmed by THIS run (the e2e DB and the chain keep earlier runs). */
  const mySwaps: string[] = [];
  const sseAbort = new AbortController();

  const rpc = (method: string, params: unknown[] = []) =>
    fetch(CHAIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }).then((r) => r.json() as Promise<{ result?: unknown; error?: { message: string } }>);

  const get = (path: string) => fetch(`${base}${path}`).then(async (r) => ({ status: r.status, body: (await r.json()) as Json }));
  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(
      async (r) => ({ status: r.status, location: r.headers.get('location'), body: (await r.json()) as Json }),
    );

  async function untilDone(jobId: string, timeoutMs = 30_000): Promise<Json> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const { body } = await get(`/api/v1/jobs/${jobId}`);
      if (TERMINAL.includes(body.status as string)) return body;
      if (Date.now() > end) throw new Error(`job ${jobId} stuck in ${String(body.status)}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async function until<T>(fn: () => Promise<T | undefined>, what: string, timeoutMs = 15_000): Promise<T> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const v = await fn();
      if (v !== undefined) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async function listen(safe: Address) {
    const res = await fetch(`${base}/api/v1/vaults/${safe}/events`, { signal: sseAbort.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buf += decoder.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const data = frame.split('\n').find((l) => l.startsWith('data:'));
            if (data) sse.push(JSON.parse(data.slice(5)) as Json);
          }
        }
      } catch {
        /* aborted at teardown */
      }
    })();
  }

  beforeAll(async () => {
    d = JSON.parse(readFileSync(DEPLOYMENT!, 'utf8')) as Deployment;
    chain = createPublicClient({ chain: avalancheFuji, transport: http(CHAIN_URL) }) as PublicClient;

    // A fresh day: the daily cap no longer depends on what earlier runs spent (module uses block.timestamp / 1 days).
    await rpc('evm_increaseTime', [86_400]);
    await rpc('evm_mine');
    const info = (await rpc('anvil_nodeInfo')).result as { forkConfig?: { forkBlockNumber?: number } };
    const forkBlock = info.forkConfig?.forkBlockNumber;

    Object.assign(process.env, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      FUJI_RPC_URLS: CHAIN_URL,
      ANVIL_RPC_URL: SIM_URL,
      AGENT_PRIVATE_KEY: AGENT_KEY,
      SAFE_ADDRESS: d.publicSafe,
      POLICY_MODULE_ADDRESS: d.publicModule,
      TOKEN_A_ADDRESS: d.usdc,
      TOKEN_B_ADDRESS: d.wavax,
      FACTORY_ADDRESS: d.factory,
      INDEXER_START_BLOCK: String(forkBlock !== undefined ? forkBlock + 1 : 0),
      INDEXER_POLL_MS: '300',
      GEMINI_API_KEY: '', // template explainer: deterministic and offline
      // The suite fires writes back to back on purpose; the limits have their own unit tests.
      WRITE_LIMIT_PER_IP: '0',
      WRITE_COOLDOWN_MS: '0',
      DEMO_WRITE_COOLDOWN_MS: '0',
    });

    if (!existsSync(join(DIST, 'main.api.js'))) throw new Error('run "pnpm --filter server build" first: e2e boots dist/');
    const { runMigrations } = fromDist<typeof import('../../src/core/database/run-migrations')>('core/database/run-migrations');
    await runMigrations(process.env.DATABASE_URL!, join(__dirname, '..', '..', 'src', 'core', 'database', 'migrations'));

    const { ApiAppModule } = fromDist<typeof import('../../src/api-app.module')>('api-app.module');
    const { WorkerAppModule } = fromDist<typeof import('../../src/worker-app.module')>('worker-app.module');
    const { configureApi } = fromDist<typeof import('../../src/core/http/configure-api')>('core/http/configure-api');
    const { NestFactory } = fromDist<{ NestFactory: typeof import('@nestjs/core').NestFactory }>('../node_modules/@nestjs/core');
    api = configureApi(await NestFactory.create(ApiAppModule, { logger: ['error', 'warn'] }));
    await api.listen(0, '127.0.0.1');
    base = (await api.getUrl()).replace('[::1]', '127.0.0.1');
    worker = await NestFactory.createApplicationContext(WorkerAppModule, { logger: ['error', 'warn'] });
    await worker.init();
    await listen(d.publicSafe);
  }, 120_000);

  afterAll(async () => {
    sseAbort.abort();
    await worker?.close();
    await api?.close();
  });

  it('health: postgres, redis, rpc and worker are up', async () => {
    const { status, body } = await until(async () => {
      const h = await get('/api/health');
      return h.body.status === 'ok' ? h : undefined;
    }, 'health ok');
    expect(status).toBe(200);
    expect(body).toMatchObject({ postgres: 'up', redis: 'up', rpc: 'up', worker: 'up' });
  });

  it('T1: three rebalances in a row are confirmed and leave no allowance', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await post(`/api/v1/vaults/${d.publicSafe}/jobs`, { kind: 'rebalance', amountIn: '100000000' });
      expect(res.status).toBe(202);
      expect(res.location).toBe(`/api/v1/jobs/${String(res.body.jobId)}`);
      const job = await untilDone(res.body.jobId as string);
      expect(job).toMatchObject({ status: 'confirmed', reasonCode: null, precheck: { ok: true } });
      expect(job.txHash).toMatch(/^0x[0-9a-f]{64}$/);
      mySwaps.push(job.txHash as string);
      expect((job.audit as Json[]).map((a) => `${String(a.shield)}:${String(a.result)}`)).toEqual([
        'precheck:pass',
        'simulation:pass',
        'invariant:pass',
        'onchain:pass',
      ]);
    }
    const allowance = await chain.readContract({ address: d.usdc, abi: ERC20, functionName: 'allowance', args: [d.publicSafe, d.router] });
    expect(allowance).toBe(0n);

    const { body: state } = await get(`/api/v1/vaults/${d.publicSafe}/state`);
    expect(state).toMatchObject({ stale: false, isActive: true, budgetUsedPct: 20 }); // 300 of 1,500 USDC today
  }, 120_000);

  it('Shield 1 stops over-withdraw and wrong-recipient before anything is signed', async () => {
    const over = await post(`/api/v1/vaults/${d.publicSafe}/attacks`, { scenario: 'over-withdraw' });
    const wrong = await post(`/api/v1/vaults/${d.publicSafe}/attacks`, { scenario: 'wrong-recipient' });
    expect(await untilDone(over.body.jobId as string)).toMatchObject({ status: 'rejected', reasonCode: 'ExceedsPerTxCap', txHash: null });
    expect(await untilDone(wrong.body.jobId as string)).toMatchObject({ status: 'rejected', reasonCode: 'RECIPIENT_NOT_SAFE', txHash: null });
  }, 60_000);

  it('Shield 2 reverts the bypass and the unlimited approval on chain, with a tx hash', async () => {
    const bypass = await post(`/api/v1/vaults/${d.publicSafe}/attacks`, { scenario: 'bypass' });
    const approve = await post(`/api/v1/vaults/${d.publicSafe}/attacks`, { scenario: 'unlimited-approval' });
    const b = await untilDone(bypass.body.jobId as string);
    const a = await untilDone(approve.body.jobId as string);
    expect(b).toMatchObject({ status: 'reverted', reasonCode: 'ExceedsPerTxCap', revertError: 'ExceedsPerTxCap' });
    expect(a).toMatchObject({ status: 'reverted', reasonCode: 'GS104' });
    expect(b.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(b.audit).toEqual([expect.objectContaining({ shield: 'onchain', result: 'fail', reason: 'ExceedsPerTxCap' })]);

    const { body: proof } = await get('/api/v1/proof');
    expect((proof.blockedTxs as Json[]).map((t) => t.txHash)).toEqual(expect.arrayContaining([b.txHash, a.txHash]));
  }, 60_000);

  it('a client cannot queue two swaps for the same vault at once (409)', async () => {
    const first = await post(`/api/v1/vaults/${d.publicSafe}/jobs`, { kind: 'rebalance', amountIn: '1000000' });
    const second = await post(`/api/v1/vaults/${d.publicSafe}/jobs`, { kind: 'rebalance', amountIn: '1000000' });
    expect(second).toMatchObject({ status: 409, body: { code: 'QUEUE_BUSY' } });
    const done = await untilDone(first.body.jobId as string);
    if (done.status === 'confirmed') mySwaps.push(done.txHash as string);
  }, 60_000);

  it('indexer: the vault is registered and every swap of this run reaches SSE exactly once', async () => {
    const { body } = await get('/api/v1/vaults');
    expect((body.vaults as Json[]).map((v) => String(v.safe).toLowerCase())).toContain(d.publicSafe.toLowerCase());

    expect(mySwaps.length).toBeGreaterThanOrEqual(3);
    await until(async () => {
      const seen = new Set(sse.filter((e) => e.type === 'chain.swap').map((e) => e.txHash));
      return mySwaps.every((h) => seen.has(h)) ? true : undefined;
    }, 'chain.swap for every swap of this run');
    const swapEvents = sse.filter((e) => e.type === 'chain.swap').map((e) => e.txHash);
    expect(new Set(swapEvents).size).toBe(swapEvents.length); // no duplicates
    expect(sse.some((e) => e.type === 'job.explained')).toBe(true);
  }, 60_000);
});
