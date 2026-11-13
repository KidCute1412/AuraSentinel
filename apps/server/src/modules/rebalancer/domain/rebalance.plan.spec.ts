import { describe, expect, it } from 'vitest';
import { priceFromQuote } from './rebalance.math';
import { planTick, rebalanceJobId, skipReason, type VaultSnapshot } from './rebalance.plan';

const USDC = (n: bigint) => n * 10n ** 6n;
const WAVAX = (n: bigint) => n * 10n ** 18n;
const NOW = 1_762_600_000n;

const vault = (safe: string, over: Partial<VaultSnapshot> = {}): VaultSnapshot => ({
  safe,
  isDemo: false,
  isActive: true,
  expiry: NOW + 86_400n,
  now: NOW,
  hasPendingSwap: false,
  pairWhitelisted: true,
  math: {
    balanceA: USDC(1_000n),
    balanceB: WAVAX(10n), // overweight USDC: wants to sell 400 USDC
    priceAInB: priceFromQuote(USDC(1n), 5n * 10n ** 16n)!,
    thresholdBps: 200n,
    budgetA: { maxPerTx: USDC(500n), dailyCap: USDC(1_500n), spentToday: 0n },
    budgetB: { maxPerTx: WAVAX(20n), dailyCap: WAVAX(60n), spentToday: 0n },
    tokenA: '0x2222222222222222222222222222222222222222',
    tokenB: '0x3333333333333333333333333333333333333333',
    slippageBps: 100n,
  },
  ...over,
});

const SAFE_1 = '0xAaAaaAaaaaAAAaaaaaAAaaaaAAAaaaaaAAAaaAAa';
const SAFE_2 = '0xbBbBBbbbbbbBBbbbbbbBbBBbBbbbBbBbbBBBbBBb';

describe('rebalanceJobId', () => {
  it('is the same within a 10-block bucket and changes after it', () => {
    expect(rebalanceJobId(SAFE_1, 1_000n)).toBe(rebalanceJobId(SAFE_1, 1_009n));
    expect(rebalanceJobId(SAFE_1, 1_009n)).not.toBe(rebalanceJobId(SAFE_1, 1_010n));
    expect(rebalanceJobId(SAFE_1, 1_234n)).toBe('rebalance:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:123');
  });

  it('ignores address case and differs per vault', () => {
    expect(rebalanceJobId(SAFE_1.toUpperCase().replace('0X', '0x'), 5n)).toBe(rebalanceJobId(SAFE_1, 5n));
    expect(rebalanceJobId(SAFE_1, 5n)).not.toBe(rebalanceJobId(SAFE_2, 5n));
  });
});

describe('skipReason', () => {
  const cases: [string, Partial<VaultSnapshot>, string | null][] = [
    ['a normal vault', {}, null],
    ['the public demo vault (D15)', { isDemo: true }, 'demo-vault'],
    ['a vault after Kill-Switch', { isActive: false }, 'policy-inactive'],
    ['now == expiry is still valid', { now: NOW + 86_400n }, null],
    ['an expired policy', { now: NOW + 86_401n }, 'policy-expired'],
    ['a vault whose policy does not whitelist both tokens', { pairWhitelisted: false }, 'pair-not-whitelisted'],
    ['a vault with a swap still in the queue', { hasPendingSwap: true }, 'pending-swap'],
    ['a pool too thin to quote (D8)', { math: { ...vault(SAFE_1).math, priceAInB: 0n } }, 'no-quote'],
  ];
  it.each(cases)('%s', (_name, over, reason) => {
    expect(skipReason(vault(SAFE_1, over))).toBe(reason);
  });
});

describe('planTick: every enabled vault, no duplicates', () => {
  it('plans one swap per vault that needs it and says why the others are skipped', () => {
    const plan = planTick(
      [
        vault(SAFE_1),
        vault(SAFE_2, { isDemo: true }),
        vault('0xcccccccccccccccccccccccccccccccccccccccc', { math: { ...vault(SAFE_1).math, balanceB: WAVAX(50n) } }),
      ],
      1_234n,
    );
    expect(plan).toEqual([
      {
        safe: SAFE_1,
        action: 'swap',
        jobId: rebalanceJobId(SAFE_1, 1_234n),
        intent: expect.objectContaining({ amountIn: USDC(400n), recipient: SAFE_1, origin: 'rebalancer' }),
      },
      { safe: SAFE_2, action: 'skip', reason: 'demo-vault' },
      { safe: '0xcccccccccccccccccccccccccccccccccccccccc', action: 'skip', reason: 'balanced' },
    ]);
  });

  it('a tick that fires again in the same bucket yields the same job id (queue dedupes)', () => {
    const a = planTick([vault(SAFE_1)], 1_230n);
    const b = planTick([vault(SAFE_1)], 1_239n);
    expect(a[0]).toEqual(b[0]);
  });

  it('once the first swap is queued, the next tick skips the vault', () => {
    const [first] = planTick([vault(SAFE_1)], 1_230n);
    expect(first?.action).toBe('swap');
    const [next] = planTick([vault(SAFE_1, { hasPendingSwap: true })], 1_250n);
    expect(next).toEqual({ safe: SAFE_1, action: 'skip', reason: 'pending-swap' });
  });

  it('always sends the output back to the vault itself', () => {
    for (const d of planTick([vault(SAFE_1), vault(SAFE_2)], 99n)) {
      if (d.action === 'swap') expect(d.intent.recipient).toBe(d.safe);
    }
  });
});
