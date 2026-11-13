import { ServerEvent } from '@agentshield/shared';
import { describe, expect, it } from 'vitest';
import { jsonArgs, nextRange, toServerEvent } from './indexer';

const SAFE = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';
const MODULE = '0x2222222222222222222222222222222222222222';
const USDC = '0x3333333333333333333333333333333333333333';
const WAVAX = '0x4444444444444444444444444444444444444444';
const OWNER = '0x5555555555555555555555555555555555555555';
const TX = `0x${'ab'.repeat(32)}` as const;

describe('nextRange', () => {
  it('resumes right after the cursor', () => {
    expect(nextRange(100n, 150n, undefined)).toEqual({ from: 101n, to: 150n });
  });

  it('caps the span so the RPC accepts the getLogs call', () => {
    expect(nextRange(0n, 10_000n, undefined, 2_000n)).toEqual({ from: 1n, to: 2_000n });
  });

  it('starts at the configured block, else at the head (no backfill)', () => {
    expect(nextRange(undefined, 500n, 400n)).toEqual({ from: 400n, to: 499n }); // default span 100
    expect(nextRange(undefined, 500n, undefined)).toEqual({ from: 500n, to: 500n });
  });

  it('is null when caught up, so the same blocks are never read twice', () => {
    expect(nextRange(500n, 500n, undefined)).toBeNull();
  });
});

describe('toServerEvent', () => {
  it('GuardedSwap -> chain.swap with string amounts', () => {
    const e = toServerEvent(
      {
        eventName: 'GuardedSwap',
        args: { tokenIn: USDC, tokenOut: WAVAX, amountIn: 200_000_000n, amountOut: 8n * 10n ** 18n, dayId: 20405n, spentToday: 300_000_000n },
      },
      SAFE,
      TX,
    );
    expect(ServerEvent.parse(e)).toEqual(e);
    expect(e).toMatchObject({ type: 'chain.swap', vault: SAFE, amountIn: '200000000', spentToday: '300000000' });
  });

  it('PolicySet -> chain.policy with limits zipped per token', () => {
    const e = toServerEvent(
      {
        eventName: 'PolicySet',
        args: {
          agentSigner: OWNER,
          epoch: 2n,
          router: MODULE,
          expiry: 1_795_000_000n,
          isActive: true,
          tokens: [USDC, WAVAX],
          limits: [
            { maxPerTx: 500_000_000n, dailyCap: 1_500_000_000n },
            { maxPerTx: 20n * 10n ** 18n, dailyCap: 60n * 10n ** 18n },
          ],
        },
      },
      SAFE,
      TX,
    );
    expect(ServerEvent.parse(e)).toEqual(e);
    expect(e).toMatchObject({
      type: 'chain.policy',
      policy: { expiry: 1_795_000_000, limits: [{ token: USDC, maxPerTx: '500000000', dailyCap: '1500000000' }, { token: WAVAX }] },
    });
  });

  it('PolicyRevoked -> chain.revoked; ModuleDeployed -> vault.registered', () => {
    const revoked = toServerEvent({ eventName: 'PolicyRevoked', args: { by: OWNER, at: 1n } }, SAFE, TX);
    const registered = toServerEvent({ eventName: 'ModuleDeployed', args: { safe: SAFE, module: MODULE, owner: OWNER } }, SAFE, TX);
    expect(ServerEvent.parse(revoked)).toEqual({ type: 'chain.revoked', vault: SAFE, txHash: TX });
    expect(ServerEvent.parse(registered)).toEqual({ type: 'vault.registered', vault: SAFE, module: MODULE, owner: OWNER });
  });
});

describe('jsonArgs', () => {
  it('turns every bigint into a decimal string, deeply', () => {
    expect(jsonArgs({ a: 1n, b: [2n, { c: 3n }], d: 'x', e: true })).toEqual({ a: '1', b: ['2', { c: '3' }], d: 'x', e: true });
  });
});
