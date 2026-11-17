/**
 * Pure verdicts for `pnpm seed --verify`: numbers in, PASS / WARN / FAIL out. No I/O, so every threshold is unit
 * tested (judge.test.ts). Money is bigint base units throughout (P5); formatting only happens in `detail`.
 */
import { formatUnits } from "viem";

export type Status = "PASS" | "WARN" | "FAIL" | "SKIP";
export interface Verdict {
  status: Status;
  detail: string;
}

const DAY = 86_400;

/** Demo numbers (CreateVault.s.sol, demo.md): what the 3-minute script assumes. */
export const DEMO = {
  usdcMaxPerTx: 500_000_000n,
  usdcDailyCap: 1_500_000_000n,
  /** The script spends 200 USDC, then shows an over-limit attack: keep at least this much budget for the day. */
  usdcBudgetNeeded: 500_000_000n,
  /** Safe float the script needs (a few 200 USDC rebalances). */
  safeUsdcMin: 1_000_000_000n,
  /** SetupPool.s.sol: 400,000 USDC + 16,000 WAVAX = 25 USDC per WAVAX. */
  poolUsdcTarget: 400_000_000_000n,
  poolPriceUsdcPerWavax: 25,
} as const;

export const usdc = (v: bigint) => `${Number(formatUnits(v, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`;
export const avax = (v: bigint, symbol = "AVAX") => `${Number(formatUnits(v, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${symbol}`;
const hours = (s: number) => (s >= 2 * DAY ? `${Math.floor(s / DAY)} days` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);

export function judgePolicyLive(isActive: boolean, expiry: number, nowSec: number): Verdict {
  if (!isActive) return { status: "FAIL", detail: "Kill-Switch is on (isActive = false): the owner must sign a new policy (Re-activate)" };
  const left = expiry - nowSec;
  if (left <= 0) return { status: "FAIL", detail: "policy expired: the owner must sign a new one" };
  if (left < 7 * DAY) return { status: "WARN", detail: `active, expires in ${hours(left)}: renew before the demo` };
  return { status: "PASS", detail: `active, expires in ${hours(left)}` };
}

export function judgeDemoLimits(maxPerTx: bigint, dailyCap: bigint): Verdict {
  const ok = maxPerTx === DEMO.usdcMaxPerTx && dailyCap === DEMO.usdcDailyCap;
  return {
    status: ok ? "PASS" : "WARN",
    detail: `USDC ${usdc(maxPerTx)} per tx / ${usdc(dailyCap)} per day${ok ? "" : ` (demo script expects ${usdc(DEMO.usdcMaxPerTx)} / ${usdc(DEMO.usdcDailyCap)})`}`,
  };
}

/** Budget left today, and how long until the UTC day (and the budget) resets: 00:00 UTC = 07:00 in Vietnam. */
export function judgeBudget(spent: bigint, dailyCap: bigint, nowSec: number): Verdict {
  const left = dailyCap > spent ? dailyCap - spent : 0n;
  const reset = DAY - (nowSec % DAY);
  const detail = `${usdc(spent)} of ${usdc(dailyCap)} used today; resets in ${hours(reset)} (00:00 UTC = 07:00 VN)`;
  if (left < DEMO.usdcBudgetNeeded) return { status: "WARN", detail: `${detail}: not enough left for the demo script` };
  return { status: "PASS", detail };
}

export function judgeSafeFunds(usdcBal: bigint, wavaxBal: bigint): Verdict {
  const detail = `${usdc(usdcBal)}, ${avax(wavaxBal, "WAVAX")}`;
  if (usdcBal === 0n && wavaxBal === 0n) return { status: "FAIL", detail: `${detail}: the Safe is empty` };
  if (usdcBal < DEMO.safeUsdcMin) return { status: "WARN", detail: `${detail}: top up USDC before the demo` };
  return { status: "PASS", detail };
}

export function judgeAllowances(usdcAllowance: bigint, wavaxAllowance: bigint): Verdict {
  return usdcAllowance === 0n && wavaxAllowance === 0n
    ? { status: "PASS", detail: "no allowance from the Safe to the router" }
    : { status: "FAIL", detail: `allowance left: USDC ${usdcAllowance}, WAVAX ${wavaxAllowance} (C5 says it must be 0)` };
}

/** `minWei` is the server's AGENT_MIN_GAS_WEI: below it the API refuses new jobs. */
export function judgeAgentGas(balanceWei: bigint, minWei: bigint): Verdict {
  const detail = `${avax(balanceWei)} (server refuses jobs below ${avax(minWei)})`;
  if (balanceWei < minWei) return { status: "FAIL", detail: `${detail}: fund the agent from the faucet` };
  if (balanceWei < 100_000_000_000_000_000n) return { status: "WARN", detail: `${detail}: under 0.1 AVAX, top up before the demo` };
  return { status: "PASS", detail };
}

/** Pool depth and price, from the pair reserves. A shallow or skewed pool makes swaps revert on minOut. */
export function judgePool(usdcReserve: bigint, wavaxReserve: bigint): Verdict {
  if (usdcReserve === 0n || wavaxReserve === 0n) return { status: "FAIL", detail: "pool is empty" };
  // USDC per WAVAX with 2 decimals, in bigint: (usdc / 1e6) / (wavax / 1e18).
  const priceX100 = (usdcReserve * 10n ** 12n * 100n) / wavaxReserve;
  const price = Number(priceX100) / 100;
  const drift = Math.abs(price - DEMO.poolPriceUsdcPerWavax) / DEMO.poolPriceUsdcPerWavax;
  const detail = `${usdc(usdcReserve)} + ${avax(wavaxReserve, "WAVAX")}, ${price.toFixed(2)} USDC per WAVAX`;
  if (drift > 0.5) return { status: "FAIL", detail: `${detail}: price is more than 50% off ${DEMO.poolPriceUsdcPerWavax}` };
  if (usdcReserve < DEMO.poolUsdcTarget / 2n) return { status: "WARN", detail: `${detail}: shallower than half the seeded ${usdc(DEMO.poolUsdcTarget)}` };
  if (drift > 0.2) return { status: "WARN", detail: `${detail}: price is ${(drift * 100).toFixed(0)}% off ${DEMO.poolPriceUsdcPerWavax}` };
  return { status: "PASS", detail };
}

/** Server state vs chain (P1: the chain is the truth, the server only mirrors it). */
export function judgeMirror(field: string, chain: string, server: string): Verdict {
  return chain === server
    ? { status: "PASS", detail: `${field} = ${chain} on both` }
    : { status: "FAIL", detail: `${field}: chain ${chain}, server ${server}` };
}

/** A URL may embed an API key in its path or query: show only the scheme and host. */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname.length > 1 || u.search ? "/…" : ""}`;
  } catch {
    return "(invalid url)";
  }
}
