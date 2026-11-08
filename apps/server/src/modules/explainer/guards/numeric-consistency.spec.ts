import { REASONS, type ReasonCode } from '@agentshield/shared';
import { describe, expect, it } from 'vitest';
import type { ExplainInput } from '../explainer.port';
import { buildFacts, type ExplainFacts } from '../facts';
import { templateMessageVi } from '../template';
import { checkExplanation } from './numeric-consistency';

const USDC = (n: bigint) => n * 10n ** 6n;
const WAVAX = (n: bigint) => n * 10n ** 18n;
const SAFE = '0x1111111111111111111111111111111111111111';
const HACKER = '0x9999999999999999999999999999999999999999';

const base: ExplainInput = {
  verdict: 'approved',
  budgetUsedPct: 13.3,
  intent: {
    tokenIn: '0x3333333333333333333333333333333333333333',
    tokenOut: '0x4444444444444444444444444444444444444444',
    amountIn: USDC(200n),
    minAmountOut: WAVAX(9n),
    recipient: SAFE,
    origin: 'rebalancer',
  },
  sim: {
    ok: true,
    deltaSafeTokenIn: (-USDC(200n)).toString(),
    deltaSafeTokenOut: (WAVAX(19n) / 2n).toString(),
    attackerBalance: '0',
    allowanceAfter: '0',
  },
  tokens: { in: { symbol: 'USDC', decimals: 6 }, out: { symbol: 'WAVAX', decimals: 18 } },
  limits: { maxPerTx: USDC(500n), dailyCap: USDC(1_500n), spentToday: 0n },
};
const safe = buildFacts(base);
const blocked = (reasonCode: ReasonCode, over: Partial<ExplainInput> = {}): ExplainFacts =>
  buildFacts({
    ...base,
    verdict: 'blocked',
    reasonCode,
    budgetUsedPct: 0,
    sim: undefined,
    intent: { ...base.intent, amountIn: USDC(2_000n) },
    expiry: 4_102_419_540n,
    ...over,
  });
const overCap = blocked('ExceedsPerTxCap');

const reject = (msg: string, f: ExplainFacts) => {
  const r = checkExplanation(msg, f);
  return r.ok ? null : r.reason;
};

describe('the template sentences always pass (the reference must be a valid answer)', () => {
  it('safe swap', () => {
    expect(reject(templateMessageVi(safe), safe)).toBeNull();
  });

  const codes = Object.keys(REASONS) as ReasonCode[];
  it.each(codes)('%s, with and without numbers', (code) => {
    for (const f of [blocked(code), blocked(code, { tokens: undefined, limits: undefined, expiry: undefined })]) {
      expect(reject(templateMessageVi(f), f)).toBeNull();
    }
  });

  it('attack #2 may name the attacker address it was asked to pay', () => {
    const f = blocked('RECIPIENT_NOT_SAFE', { intent: { ...base.intent, amountIn: USDC(2_000n), recipient: HACKER } });
    expect(reject(templateMessageVi(f), f)).toBeNull();
    expect(reject('Lệnh định chuyển 2.000 USDC cho 0x9999…9999 nên bị chặn.', f)).toBeNull();
  });
});

describe('accepts honest rewrites', () => {
  const ok: [string, string, ExplainFacts][] = [
    ['VN number format', 'Đổi 200 USDC lấy khoảng 9,5 WAVAX; tiền không rời két, đã dùng 13,3% hạn mức ngày.', safe],
    ['EN number format', 'Lệnh 2,000 USDC bị chặn vì quá hạn mức 500 USDC mỗi lần.', overCap],
    ['negated success', 'Lệnh 2.000 USDC không thành công vì vượt hạn mức 500 USDC.', overCap],
    ['negated block', 'Lệnh đổi 200 USDC không bị chặn, tiền vẫn ở trong két.', safe],
    ['reason code with digits', 'Safe từ chối lệnh (GS104): ví này không phải module được bật.', blocked('GS104')],
    ['full-width digits are normalised', 'Lệnh ２.０００ USDC vượt hạn mức ５００ USDC.', overCap],
  ];
  it.each(ok)('%s', (_name, msg, f) => {
    expect(reject(msg, f)).toBeNull();
  });
});

describe('rejects', () => {
  const bad: [string, string, ExplainFacts, string][] = [
    ['an invented amount', 'Lệnh 5.000 USDC vượt hạn mức 500 USDC.', overCap, 'unknown-number'],
    ['a changed cap', 'Lệnh 2.000 USDC vượt hạn mức 1.000 USDC.', overCap, 'unknown-number'],
    ['an invented percentage', 'Đổi 200 USDC lấy 9,5 WAVAX, đã dùng 50% hạn mức.', safe, 'unknown-number'],
    ['full-width invented digits', 'Lệnh ５.０００ USDC vượt hạn mức.', overCap, 'unknown-number'],
    ['an address not in the facts', 'Lệnh 2.000 USDC bị chặn, hãy gửi lại tới 0xdeadbeef.', overCap, 'unknown-address'],
    ['a shortened foreign address', 'Lệnh 2.000 USDC bị chặn, liên hệ 0x1234…abcd.', overCap, 'unknown-address'],
    ['a link', 'Lệnh 2.000 USDC bị chặn, xem https://evil.example', overCap, 'markup'],
    ['html', 'Lệnh <b>2.000 USDC</b> bị chặn.', overCap, 'markup'],
    ['markdown', 'Lệnh **2.000 USDC** bị chặn.', overCap, 'markup'],
    ['an echoed prompt', 'You explain the outcome of one trade: 2.000 USDC bị chặn.', overCap, 'prompt-leak'],
    ['a dropped amount', 'Lệnh bị chặn vì vượt hạn mức.', overCap, 'missing-amount'],
    ['a blocked swap called a success', 'Lệnh 2.000 USDC đã được duyệt thành công.', overCap, 'contradicts-verdict'],
    ['a blocked swap with no blocking word', 'Lệnh 2.000 USDC rất tốt cho két.', overCap, 'contradicts-verdict'],
    ['a safe swap called blocked', 'Lệnh đổi 200 USDC đã bị chặn.', safe, 'contradicts-verdict'],
    ['zero-width split words', 'Lệnh 2.000 USDC đã\u200B được duyệt.', overCap, 'contradicts-verdict'],
  ];
  it.each(bad)('%s', (_name, msg, f, reason) => {
    expect(reject(msg, f)).toBe(reason);
  });
});
