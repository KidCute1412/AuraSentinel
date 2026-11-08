import type { JobDetailDto, JobDto, StateDto } from "@agentshield/shared";

/** Payloads shaped like the examples in docs/architecture/api.md. Money is base-unit strings. */
export const SAFE = "0x1111111111111111111111111111111111111111";
export const OTHER_SAFE = "0x2222222222222222222222222222222222222222";
export const USDC = "0x3333333333333333333333333333333333333333";
export const WAVAX = "0x4444444444444444444444444444444444444444";
export const AGENT = "0x5555555555555555555555555555555555555555";
export const TX = `0x${"ab".repeat(32)}` as const;

export const state: StateDto = {
  safe: SAFE,
  blockNumber: "49234500",
  isActive: true,
  policyEpoch: 3,
  policy: {
    agentSigner: AGENT,
    expiry: 1_795_000_000,
    limits: [
      { token: USDC, maxPerTx: "500000000", dailyCap: "1500000000" },
      { token: WAVAX, maxPerTx: "20000000000000000000", dailyCap: "60000000000000000000" },
    ],
  },
  spentToday: [{ token: USDC, dayId: 20400, amount: "200000000" }],
  balances: [
    { token: USDC, symbol: "USDC", decimals: 6, amount: "2800000000" },
    { token: WAVAX, symbol: "WAVAX", decimals: 18, amount: "10900000000000000000" },
  ],
  budgetUsedPct: 13.3,
  stale: false,
};

export function job(over: Partial<JobDto> = {}): JobDto {
  return {
    id: "7f9c0000-0000-4000-8000-000000000001",
    vault: SAFE,
    kind: "swap",
    origin: "manual",
    status: "queued",
    intent: {
      tokenIn: USDC,
      tokenOut: WAVAX,
      amountIn: "200000000",
      minAmountOut: "9500000000000000000",
      recipient: SAFE,
      origin: "manual",
    },
    txHash: null,
    explorerUrl: null,
    revertError: null,
    reasonCode: null,
    explanation: null,
    createdAt: "2026-11-09T10:00:00.000Z",
    updatedAt: "2026-11-09T10:00:00.000Z",
    ...over,
  };
}

export function jobDetail(over: Partial<JobDetailDto> = {}): JobDetailDto {
  return { ...job(), precheck: { ok: true, reasons: [] }, sim: null, audit: [], ...over };
}

export const explanation = {
  verdict: "safe" as const,
  budgetUsedPct: 13.3,
  messageVi: "Giao dịch an toàn, dùng 13,3% hạn mức ngày.",
  source: "template" as const,
};

export const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
