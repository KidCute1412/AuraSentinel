/** SIWE verification with real signatures. Lives in test/ because it holds Anvil dev keys (check-invariants P5: no key material in src/). */
import { HttpException } from '@nestjs/common';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/core/config/env.schema';
import { AuthService } from '../../src/modules/auth/auth.service';
import type { NonceStore } from '../../src/modules/auth/nonce.store';
import type { OwnershipService } from '../../src/modules/auth/ownership.service';

// Anvil dev keys (public, test only).
const owner = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const other = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const SAFE = '0x1111111111111111111111111111111111111111';
const HOST = 'localhost:8080';

function setup(env: Partial<Env> = {}) {
  const issued = new Set<string>(['abcdef1234567890']);
  const nonces = {
    issue: vi.fn(),
    consume: vi.fn(async (n: string) => issued.delete(n)),
  };
  const ownership = {
    isAdmin: (a: string) => a.toLowerCase() === other.address.toLowerCase(),
    ownedVaults: vi.fn(async (a: string) => (a.toLowerCase() === owner.address.toLowerCase() ? [SAFE] : [])),
  };
  const client = { verifyMessage: vi.fn(async () => false) };
  const svc = new AuthService(
    nonces as unknown as NonceStore,
    ownership as unknown as OwnershipService,
    client as never,
    { SIWE_DOMAINS: [], ...env } as unknown as Env,
  );
  return { svc, nonces };
}

const message = (over: Partial<Parameters<typeof createSiweMessage>[0]> = {}) =>
  createSiweMessage({
    address: owner.address,
    chainId: 43113,
    domain: HOST,
    nonce: 'abcdef1234567890',
    uri: `http://${HOST}`,
    version: '1',
    statement: 'Sign in to AgentShield',
    ...over,
  });

async function status(p: Promise<unknown>) {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as HttpException).getStatus();
  }
}

describe('AuthService.verify (SIWE)', () => {
  it('accepts a correctly signed message and returns the checksummed address', async () => {
    const { svc } = setup();
    const m = message();
    await expect(svc.verify(m, await owner.signMessage({ message: m }), HOST)).resolves.toBe(owner.address);
  });

  it('a nonce works once: the same signature replayed is refused', async () => {
    const { svc } = setup();
    const m = message();
    const sig = await owner.signMessage({ message: m });
    await svc.verify(m, sig, HOST);
    expect(await status(svc.verify(m, sig, HOST))).toBe(401);
  });

  it('refuses a signature from another wallet than the message address', async () => {
    const { svc } = setup();
    const m = message();
    expect(await status(svc.verify(m, await other.signMessage({ message: m }), HOST))).toBe(401);
  });

  it('refuses a message issued for another domain (phishing site relay)', async () => {
    const { svc } = setup();
    const m = message({ domain: 'evil.example', uri: 'https://evil.example' });
    expect(await status(svc.verify(m, await owner.signMessage({ message: m }), HOST))).toBe(401);
  });

  it('SIWE_DOMAINS overrides the request host (dev behind the Vite proxy)', async () => {
    const { svc } = setup({ SIWE_DOMAINS: ['localhost:5173'] } as Partial<Env>);
    const m = message({ domain: 'localhost:5173', uri: 'http://localhost:5173' });
    await expect(svc.verify(m, await owner.signMessage({ message: m }), 'localhost:4000')).resolves.toBe(owner.address);
  });

  it('refuses another chain and an expired message', async () => {
    const { svc } = setup();
    const wrongChain = message({ chainId: 1 });
    expect(await status(svc.verify(wrongChain, await owner.signMessage({ message: wrongChain }), HOST))).toBe(401);
    const expired = message({ expirationTime: new Date(Date.now() - 1_000) });
    expect(await status(svc.verify(expired, await owner.signMessage({ message: expired }), HOST))).toBe(401);
  });

  it('refuses something that is not a SIWE message', async () => {
    const { svc } = setup();
    expect(await status(svc.verify('hello', await owner.signMessage({ message: 'hello' }), HOST))).toBe(401);
  });
});

describe('AuthService.describe', () => {
  it('owner of a registered vault -> owner; allowlisted -> admin; else user', async () => {
    const { svc } = setup();
    await expect(svc.describe(owner.address)).resolves.toMatchObject({ role: 'owner', ownedVaults: [SAFE] });
    await expect(svc.describe(other.address)).resolves.toMatchObject({ role: 'admin' });
    await expect(svc.describe('0x' + '3'.repeat(40))).resolves.toMatchObject({ role: 'user', ownedVaults: [] });
  });
});
