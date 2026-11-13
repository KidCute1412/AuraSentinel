import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../core/config/env.schema';
import type { LimitResult, RateLimiter } from '../../core/redis/rate-limiter';
import type { OwnershipService } from '../auth/ownership.service';
import type { SessionService } from '../auth/session.service';
import type { VaultRegistryService } from '../vault/vault-registry.service';
import { WriteGuard } from './write.guard';

const DEMO = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const MODULE = '0x3333333333333333333333333333333333333333';
const AGENT = '0x4444444444444444444444444444444444444444';
const OWNER = '0x5555555555555555555555555555555555555555';
const STRANGER = '0x6666666666666666666666666666666666666666';

/** In-memory stand-in with the same semantics as the Redis limiter. */
class FakeLimiter {
  now = 0;
  private windows = new Map<string, { count: number; until: number }>();
  private cooldowns = new Map<string, number>();
  async window(key: string, max: number, ms: number): Promise<LimitResult> {
    const w = this.windows.get(key);
    const cur = w && w.until > this.now ? w : { count: 0, until: this.now + ms };
    cur.count++;
    this.windows.set(key, cur);
    return cur.count <= max ? { ok: true, retryAfterMs: 0 } : { ok: false, retryAfterMs: cur.until - this.now };
  }
  async cooldown(key: string, ms: number): Promise<LimitResult> {
    const until = this.cooldowns.get(key) ?? 0;
    if (until > this.now) return { ok: false, retryAfterMs: until - this.now };
    this.cooldowns.set(key, this.now + ms);
    return { ok: true, retryAfterMs: 0 };
  }
}

const ENV = {
  SAFE_ADDRESS: DEMO,
  WRITE_LIMIT_PER_IP: 3,
  WRITE_IP_WINDOW_MS: 60_000,
  WRITE_COOLDOWN_MS: 2_000,
  DEMO_WRITE_COOLDOWN_MS: 5_000,
  AGENT_MIN_GAS_WEI: 20n,
} as unknown as Env;

function setup(opts: { balance?: bigint; env?: Partial<Env>; rpcDown?: boolean; lookupDown?: boolean } = {}) {
  const limiter = new FakeLimiter();
  const vaults = {
    isDemo: (a: string) => a.toLowerCase() === DEMO,
    resolve: vi.fn(async (safe: string) => {
      if (opts.lookupDown) throw new Error('rpc down');
      return safe.toLowerCase() === '0x' + '7'.repeat(40) ? null : { safe, module: MODULE, isDemo: safe.toLowerCase() === DEMO };
    }),
  };
  const client = {
    readContract: vi.fn(async () => [AGENT, MODULE, 0n, true]),
    getBalance: vi.fn(async () => {
      if (opts.rpcDown) throw new Error('rpc down');
      return opts.balance ?? 10n ** 18n;
    }),
  };
  let signedIn: string | null = OWNER;
  const sessions = { address: () => signedIn };
  const ownership = { isOwner: vi.fn(async (a: string) => a === OWNER) };
  const guard = new WriteGuard(
    limiter as unknown as RateLimiter,
    vaults as unknown as VaultRegistryService,
    sessions as unknown as SessionService,
    ownership as unknown as OwnershipService,
    client as never,
    { ...ENV, ...opts.env } as Env,
  );
  const call = async (safe: string, ip = '203.0.113.7', endpoint = 'jobs') => {
    const res = { setHeader: vi.fn() };
    const req = { params: { safe }, path: `/api/v1/vaults/${safe}/${endpoint}`, ip, socket: {} };
    const ctx = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) };
    try {
      await guard.canActivate(ctx as never);
      return { status: 'ok' as const, res };
    } catch (e) {
      const ex = e as HttpException;
      return { status: ex.getStatus(), body: ex.getResponse() as { code: string }, res };
    }
  };
  return { limiter, client, call, signIn: (a: string | null) => (signedIn = a) };
}

describe('WriteGuard: access (D12)', () => {
  it('demo vault: guests need no session', async () => {
    const t = setup();
    t.signIn(null);
    expect((await t.call(DEMO)).status).toBe('ok');
  });

  it('private vault: 401 signed out, 403 for a non-owner, ok for an owner', async () => {
    const t = setup({ env: { WRITE_COOLDOWN_MS: 0 } as Partial<Env> });
    t.signIn(null);
    expect(await t.call(OTHER)).toMatchObject({ status: 401, body: { code: 'UNAUTHENTICATED' } });
    t.signIn(STRANGER);
    expect(await t.call(OTHER)).toMatchObject({ status: 403, body: { code: 'NOT_OWNER' } });
    t.signIn(OWNER);
    expect((await t.call(OTHER)).status).toBe('ok');
  });

  it('a stranger spamming a private vault cannot lock its owner out (auth before cooldown)', async () => {
    const t = setup();
    t.signIn(STRANGER);
    for (let i = 0; i < 3; i++) expect((await t.call(OTHER, '198.51.100.9')).status).toBe(403);
    t.signIn(OWNER);
    expect((await t.call(OTHER, '198.51.100.1')).status).toBe('ok');
  });

  it('fails closed when the vault lookup errors (no owner check skipped)', async () => {
    const t = setup({ lookupDown: true });
    t.signIn(null);
    expect(await t.call(OTHER)).toMatchObject({ status: 503, body: { code: 'CHAIN_UNAVAILABLE' } });
  });

  it('an unknown vault passes to the controller (404 there)', async () => {
    const t = setup();
    t.signIn(null);
    expect((await t.call('0x' + '7'.repeat(40))).status).toBe('ok');
  });
});

describe('WriteGuard: limits', () => {
  it('lets a normal request through', async () => {
    const t = setup();
    expect((await t.call(OTHER)).status).toBe('ok');
  });

  it('demo vault: one write from anyone per cooldown, with Retry-After', async () => {
    const t = setup();
    expect((await t.call(DEMO, '198.51.100.1')).status).toBe('ok');
    const second = await t.call(DEMO, '198.51.100.2', 'attacks'); // another visitor, another endpoint
    expect(second).toMatchObject({ status: 429, body: { code: 'COOLDOWN' } });
    expect(second.res.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    t.limiter.now += 5_000;
    expect((await t.call(DEMO, '198.51.100.2')).status).toBe('ok');
  });

  it('other vaults: cooldown per (vault, endpoint), endpoints independent', async () => {
    const t = setup();
    expect((await t.call(OTHER, undefined, 'jobs')).status).toBe('ok');
    expect((await t.call(OTHER, undefined, 'attacks')).status).toBe('ok');
    expect((await t.call(OTHER, undefined, 'jobs')).status).toBe(429);
  });

  it('per-IP limit across vaults: 429 RATE_LIMITED after the quota', async () => {
    const t = setup({ env: { WRITE_COOLDOWN_MS: 0, DEMO_WRITE_COOLDOWN_MS: 0 } as Partial<Env> });
    for (let i = 0; i < 3; i++) expect((await t.call(OTHER)).status).toBe('ok');
    expect(await t.call(OTHER)).toMatchObject({ status: 429, body: { code: 'RATE_LIMITED' } });
    expect((await t.call(OTHER, '192.0.2.99')).status).toBe('ok'); // another client is unaffected
  });

  it('503 AGENT_LOW_GAS when the agent cannot pay for a swap', async () => {
    const t = setup({ balance: 19n });
    expect(await t.call(OTHER)).toMatchObject({ status: 503, body: { code: 'AGENT_LOW_GAS' } });
  });

  it('fails open on an RPC error (not a misleading "low gas")', async () => {
    const t = setup({ rpcDown: true });
    expect((await t.call(OTHER)).status).toBe('ok');
  });

  it('caches the agent balance between clicks', async () => {
    const t = setup({ env: { WRITE_COOLDOWN_MS: 0, DEMO_WRITE_COOLDOWN_MS: 0 } as Partial<Env> });
    await t.call(OTHER);
    await t.call(OTHER);
    expect(t.client.getBalance).toHaveBeenCalledTimes(1);
  });

  it('0 disables every limit', async () => {
    const t = setup({ env: { WRITE_LIMIT_PER_IP: 0, WRITE_COOLDOWN_MS: 0, DEMO_WRITE_COOLDOWN_MS: 0, AGENT_MIN_GAS_WEI: 0n } as Partial<Env> });
    for (let i = 0; i < 10; i++) expect((await t.call(DEMO)).status).toBe('ok');
    expect(t.client.getBalance).not.toHaveBeenCalled();
  });
});
