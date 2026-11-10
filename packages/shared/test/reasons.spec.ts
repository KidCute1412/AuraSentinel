import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  REASONS,
  REASON_PARAMS,
  ReasonCode,
  formatAmountVi,
  formatReasonVi,
  isReasonCode,
  reasonPlaceholders,
  toReasonCode,
  type ReasonEntry,
  type ReasonParams,
} from '../src';

/** Custom errors of AgentPolicyModule as written in docs/architecture/contracts.md §4. */
const SPEC_CONTRACT_ERRORS = [
  'UnauthorizedAgent',
  'PolicyInactive',
  'PolicyExpired',
  'TokenNotWhitelisted',
  'SameToken',
  'ExceedsPerTxCap',
  'ExceedsDailyCap',
  'ZeroMinOut',
  'DeadlineTooFar',
  'SwapFailed',
  'InsufficientOutput',
  'ResidualAllowance',
  // Owner functions, reentrancy guard and factory (IAgentPolicyModule / IAgentShieldFactory)
  'NotOwner',
  'InvalidPolicy',
  'Reentrancy',
  'NotSafeOwner',
  'ModuleExists',
];

/** Committed ABI JSON (D5). Absent until packages/contracts exists (task L1). */
const ABI_DIR = fileURLToPath(new URL('../../contracts/abi', import.meta.url));
const ABI_FILES = /^(AgentPolicyModule|AgentShieldFactory).*\.json$/;

function abiErrorNames(): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(ABI_DIR).filter((f) => ABI_FILES.test(f))) {
    const json: unknown = JSON.parse(readFileSync(join(ABI_DIR, file), 'utf8'));
    // Accept a bare ABI array or a Foundry artifact ({ abi: [...] }).
    const abi = (Array.isArray(json) ? json : (json as { abi?: unknown[] }).abi ?? []) as {
      type?: string;
      name?: string;
    }[];
    for (const item of abi) if (item.type === 'error' && item.name) names.add(item.name);
  }
  return [...names];
}

const entries = Object.entries(REASONS) as [ReasonCode, ReasonEntry][];

// Worst case for length: long, fully formatted values in every slot.
const LONG: Required<ReasonParams> = {
  amount: '999.999.999.999,99 USDC',
  maxPerTx: '999.999.999.999,99 USDC',
  dailyCap: '999.999.999.999,99 USDC',
  spent: '999.999.999.999,99 USDC',
  token: '0x5a3e00000000000000000000000000000000a003',
  expiry: '23:59 31/12/2099',
  minOut: '999.999.999.999,99 WAVAX',
  recipient: '0x9999999999999999999999999999999999999999',
  actual: '999.999.999.999,99 USDC',
};

describe('reason codes cover every contract error (D6)', () => {
  it('has an entry of kind "contract" for every custom error in contracts.md §4', () => {
    for (const name of SPEC_CONTRACT_ERRORS) {
      expect(isReasonCode(name), `missing reason code for ${name}`).toBe(true);
      expect(REASONS[name as ReasonCode].kind).toBe('contract');
    }
  });

  it('has no contract entries that the spec does not define', () => {
    const contractCodes = entries.filter(([, e]) => e.kind === 'contract').map(([c]) => c);
    expect(contractCodes.sort()).toEqual([...SPEC_CONTRACT_ERRORS].sort());
  });

  it.skipIf(!existsSync(ABI_DIR))('has an entry for every error in the committed ABI', () => {
    const missing = abiErrorNames().filter((name) => !isReasonCode(name));
    expect(missing, 'add these errors to REASONS in packages/shared/src/errors.ts').toEqual([]);
  });

  it('includes the off-chain codes the pipeline relies on', () => {
    for (const code of ['GS104', 'UNKNOWN_REVERT', 'RECIPIENT_NOT_SAFE']) {
      expect(isReasonCode(code)).toBe(true);
    }
  });
});

describe('Vietnamese copy', () => {
  it.each(entries)('%s has a title and only known placeholders', (_code, entry) => {
    expect(entry.title.length).toBeGreaterThan(0);
    expect(reasonPlaceholders(entry.title)).toEqual([]);
    for (const name of reasonPlaceholders(entry.messageVi)) {
      expect(REASON_PARAMS as readonly string[]).toContain(name);
    }
  });

  it.each(entries)('%s has a number-free fallback when the template needs values', (_c, entry) => {
    if (reasonPlaceholders(entry.messageVi).length === 0) return;
    expect(entry.fallbackVi, 'templates with {placeholders} need fallbackVi').toBeTruthy();
    expect(reasonPlaceholders(entry.fallbackVi ?? '')).toEqual([]);
  });

  it.each(entries)('%s fits Explanation.messageVi (280 chars) when filled', (code, entry) => {
    expect(formatReasonVi(code, LONG).length).toBeLessThanOrEqual(280);
    expect((entry.fallbackVi ?? '').length).toBeLessThanOrEqual(280);
  });
});

describe('formatReasonVi', () => {
  it('fills the numbers from deterministic data', () => {
    const msg = formatReasonVi('ExceedsPerTxCap', {
      amount: formatAmountVi(2_000_000_000n, 6, 'USDC'),
      maxPerTx: formatAmountVi(500_000_000n, 6, 'USDC'),
    });
    expect(msg).toBe('Lệnh 2.000 USDC vượt hạn mức mỗi lệnh là 500 USDC.');
  });

  it('falls back to the number-free sentence when a value is missing', () => {
    expect(formatReasonVi('ExceedsPerTxCap', { amount: '2.000 USDC' })).toBe(
      REASONS.ExceedsPerTxCap.fallbackVi,
    );
  });

  it('never leaves a raw placeholder in the output', () => {
    for (const [code] of entries) expect(formatReasonVi(code)).not.toMatch(/\{\w+\}/);
  });

  it('maps unknown or empty codes to UNKNOWN_REVERT', () => {
    const unknown = REASONS.UNKNOWN_REVERT.messageVi;
    expect(formatReasonVi('0xdeadbeef')).toBe(unknown);
    expect(formatReasonVi(undefined)).toBe(unknown);
    expect(formatReasonVi('toString')).toBe(unknown); // no prototype keys
  });
});

describe('toReasonCode / ReasonCode schema', () => {
  it('keeps known codes and normalises the rest', () => {
    expect(toReasonCode('ExceedsDailyCap')).toBe('ExceedsDailyCap');
    expect(toReasonCode('execution reverted')).toBe('UNKNOWN_REVERT');
    expect(toReasonCode(null)).toBe('UNKNOWN_REVERT');
  });

  it('validates with Zod', () => {
    expect(ReasonCode.safeParse('GS104').success).toBe(true);
    expect(ReasonCode.safeParse('EXCEEDS_MAX_PER_TX').success).toBe(false);
  });
});

describe('formatAmountVi', () => {
  it('groups thousands with dots and uses a decimal comma', () => {
    expect(formatAmountVi(2_000_000_000n, 6, 'USDC')).toBe('2.000 USDC');
    expect(formatAmountVi(1_234_567_890_000n, 6)).toBe('1.234.567,89');
    expect(formatAmountVi(1_500_000n, 6)).toBe('1,5');
    expect(formatAmountVi(0n, 6, 'USDC')).toBe('0 USDC');
  });

  it('handles 18 decimals beyond 2^53 exactly', () => {
    expect(formatAmountVi(12_345_678_000_000_000_000_000n, 18, 'WAVAX')).toBe('12.345,67 WAVAX');
  });

  it('truncates instead of rounding up', () => {
    expect(formatAmountVi(1_999_999n, 6)).toBe('1,99');
    expect(formatAmountVi(1_999_999n, 6, undefined, 4)).toBe('1,9999');
  });

  it('formats negative deltas and never prints "-0"', () => {
    expect(formatAmountVi(-200_000_000n, 6, 'USDC')).toBe('-200 USDC');
    expect(formatAmountVi(-1n, 6)).toBe('0');
  });
});
