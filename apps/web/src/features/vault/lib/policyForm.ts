import { formatUnits, fromAmount, parseUnits, type StateDto } from "@agentshield/shared";
import { formatTokenAmount } from "@/shared/lib/format";
import { TOKENS, USDC, WAVAX } from "@/shared/api/mockEngine";
import type { PolicyInput } from "@/shared/api/mockChain";

export interface PolicyFormValues {
  usdcMaxPerTx: string;
  usdcDailyCap: string;
  wavaxMaxPerTx: string;
  wavaxDailyCap: string;
  expiryDays: number;
}

export const EXPIRY_CHOICES = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

export type PolicyErrors = Partial<Record<keyof PolicyFormValues, string>>;
export type PolicyResult = { ok: true; input: PolicyInput } | { ok: false; errors: PolicyErrors };

const DAY = 86_400;
/** Upper bound that keeps typos like an extra 9 from becoming a signed policy. */
const MAX_WHOLE_UNITS = 1_000_000_000n;

/** One amount field -> base units, or an English error message. */
export function parseLimit(raw: string, decimals: number): { value: bigint } | { error: string } {
  const text = raw.trim().replace(/,/g, "");
  if (text === "") return { error: "Enter an amount" };
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: "Use digits and a dot only" };
  let value: bigint;
  try {
    value = parseUnits(text, decimals);
  } catch {
    return { error: `At most ${decimals} decimals` };
  }
  if (value <= 0n) return { error: "Must be greater than zero" };
  if (value > MAX_WHOLE_UNITS * 10n ** BigInt(decimals)) return { error: "That is more than the app allows" };
  return { value };
}

export function validatePolicy(v: PolicyFormValues, nowSec: number): PolicyResult {
  const errors: PolicyErrors = {};
  const usdcMax = parseLimit(v.usdcMaxPerTx, TOKENS.USDC.decimals);
  const usdcDaily = parseLimit(v.usdcDailyCap, TOKENS.USDC.decimals);
  const wavaxMax = parseLimit(v.wavaxMaxPerTx, TOKENS.WAVAX.decimals);
  const wavaxDaily = parseLimit(v.wavaxDailyCap, TOKENS.WAVAX.decimals);
  if ("error" in usdcMax) errors.usdcMaxPerTx = usdcMax.error;
  if ("error" in usdcDaily) errors.usdcDailyCap = usdcDaily.error;
  if ("error" in wavaxMax) errors.wavaxMaxPerTx = wavaxMax.error;
  if ("error" in wavaxDaily) errors.wavaxDailyCap = wavaxDaily.error;
  if ("value" in usdcMax && "value" in usdcDaily && usdcMax.value > usdcDaily.value) errors.usdcMaxPerTx = "Per-transaction limit cannot exceed the daily limit";
  if ("value" in wavaxMax && "value" in wavaxDaily && wavaxMax.value > wavaxDaily.value) errors.wavaxMaxPerTx = "Per-transaction limit cannot exceed the daily limit";
  if (!EXPIRY_CHOICES.some((c) => c.days === v.expiryDays)) errors.expiryDays = "Pick an expiry";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    input: {
      usdcMaxPerTx: (usdcMax as { value: bigint }).value,
      usdcDailyCap: (usdcDaily as { value: bigint }).value,
      wavaxMaxPerTx: (wavaxMax as { value: bigint }).value,
      wavaxDailyCap: (wavaxDaily as { value: bigint }).value,
      expiry: nowSec + v.expiryDays * DAY,
    },
  };
}

const limitOf = (state: StateDto, token: string) => state.policy.limits.find((l) => l.token.toLowerCase() === token.toLowerCase());

/** Prefill the form from the current on-chain policy (plain numbers, no thousands separators). */
export function valuesFromState(state: StateDto): PolicyFormValues {
  const usdc = limitOf(state, USDC);
  const wavax = limitOf(state, WAVAX);
  return {
    usdcMaxPerTx: formatUnits(fromAmount(usdc?.maxPerTx ?? "0"), 6),
    usdcDailyCap: formatUnits(fromAmount(usdc?.dailyCap ?? "0"), 6),
    wavaxMaxPerTx: formatUnits(fromAmount(wavax?.maxPerTx ?? "0"), 18),
    wavaxDailyCap: formatUnits(fromAmount(wavax?.dailyCap ?? "0"), 18),
    expiryDays: 30,
  };
}

export interface DiffRow {
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

/** Before -> after table shown on the "you are about to sign" step. */
export function policyDiff(state: StateDto, input: PolicyInput, nowSec: number): DiffRow[] {
  const usdc = limitOf(state, USDC);
  const wavax = limitOf(state, WAVAX);
  const money = (base: string | undefined, decimals: number, symbol: string) => `${formatTokenAmount(fromAmount(base ?? "0"), decimals, 4)} ${symbol}`;
  const next = (v: bigint, decimals: number, symbol: string) => `${formatTokenAmount(v, decimals, 4)} ${symbol}`;
  const daysLeft = (ts: number) => `${Math.max(0, Math.round((ts - nowSec) / DAY))} days`;
  const rows: Omit<DiffRow, "changed">[] = [
    { label: "USDC per transaction", before: money(usdc?.maxPerTx, 6, "USDC"), after: next(input.usdcMaxPerTx, 6, "USDC") },
    { label: "USDC per day", before: money(usdc?.dailyCap, 6, "USDC"), after: next(input.usdcDailyCap, 6, "USDC") },
    { label: "WAVAX per transaction", before: money(wavax?.maxPerTx, 18, "WAVAX"), after: next(input.wavaxMaxPerTx, 18, "WAVAX") },
    { label: "WAVAX per day", before: money(wavax?.dailyCap, 18, "WAVAX"), after: next(input.wavaxDailyCap, 18, "WAVAX") },
    { label: "Expires in", before: state.isActive ? daysLeft(state.policy.expiry) : "locked", after: daysLeft(input.expiry) },
  ];
  return rows.map((r) => ({ ...r, changed: r.before !== r.after }));
}
