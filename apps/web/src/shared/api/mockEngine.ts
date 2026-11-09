import { getAddress } from "viem";
import {
  FUJI_EXPLORER,
  fromAmount,
  toAmount,
  type Address,
  type Explanation,
  type Hash,
  type JobDetailDto,
  type JobKind,
  type JobOrigin,
  type JobStatus,
  type StateDto,
} from "@agentshield/shared";
import { formatPct, formatTokenAmount } from "@/shared/lib/format";

/**
 * Deterministic stand-in for the backend + chain while the API is not wired. Pure functions only (state in,
 * state out), so every rule is unit-tested. It mirrors the real division of labour: verdicts, amounts and
 * limits are computed here with bigint math; only the explanation text is "prose".
 */

export const USDC: Address = getAddress("0x00000000000000000000000000000000005d0c01");
export const WAVAX: Address = getAddress("0x00000000000000000000000000000000000a7a01");
export const TOKENS = {
  USDC: { address: USDC, symbol: "USDC", decimals: 6 },
  WAVAX: { address: WAVAX, symbol: "WAVAX", decimals: 18 },
} as const;
export type TokenSymbol = keyof typeof TOKENS;
export const tokenBySymbol = (s: TokenSymbol) => TOKENS[s];
export const tokenByAddress = (a: string) => Object.values(TOKENS).find((t) => t.address.toLowerCase() === a.toLowerCase());

/** Fixed demo price: 1 WAVAX = 220 USDC (base units of USDC per WAVAX). */
const USDC_PER_WAVAX = 220_000_000n;
export const quoteWavaxOut = (usdcIn: bigint): bigint => (usdcIn * 10n ** 18n) / USDC_PER_WAVAX;

export const ATTACKER: Address = getAddress("0x9990000000000000000000000000000000000999");

export type AttackScenario = "over-withdraw" | "wrong-recipient" | "unlimited-approval" | "bypass";
export type JobSpec =
  | { type: "rebalance"; amountIn: bigint }
  | { type: "attack"; scenario: AttackScenario }
  | { type: "injection"; text: string };

/** Mutable-looking but treated immutably: every function returns a new object. */
export interface VaultSim {
  state: StateDto;
  jobs: JobDetailDto[];
  /** Balances around the last confirmed swap, for the Before/After card. */
  lastChange: { jobId: string; before: StateDto["balances"]; after: StateDto["balances"] } | null;
  killLatenciesMs: number[];
  epoch: number;
}

export const pctOf = (spent: bigint, cap: bigint): number => (cap === 0n ? 0 : Math.min(100, Number((spent * 1000n) / cap) / 10));

export function spentUsdc(state: StateDto): bigint {
  const row = state.spentToday.find((s) => s.token.toLowerCase() === USDC.toLowerCase());
  return row ? fromAmount(row.amount) : 0n;
}

export function usdcLimit(state: StateDto): { maxPerTx: bigint; dailyCap: bigint } {
  const l = state.policy.limits.find((x) => x.token.toLowerCase() === USDC.toLowerCase());
  return { maxPerTx: l ? fromAmount(l.maxPerTx) : 0n, dailyCap: l ? fromAmount(l.dailyCap) : 0n };
}

export function balanceOf(state: StateDto, symbol: TokenSymbol): bigint {
  const row = state.balances.find((b) => b.symbol === symbol);
  return row ? fromAmount(row.amount) : 0n;
}

export type ReasonCode =
  | "PolicyInactive"
  | "PolicyExpired"
  | "InvalidAmount"
  | "ExceedsPerTxCap"
  | "ExceedsDailyCap"
  | "InsufficientBalance"
  | "WrongRecipient"
  | "UnlimitedApproval";

export type Decision = { ok: true } | { ok: false; code: ReasonCode };

/** Shield 1 pre-check for a USDC -> WAVAX swap. The first failing rule wins, in this fixed order. */
export function evaluateSwap(state: StateDto, amountIn: bigint, nowSec: number, recipientIsVault = true): Decision {
  const { maxPerTx, dailyCap } = usdcLimit(state);
  if (!state.isActive) return { ok: false, code: "PolicyInactive" };
  if (state.policy.expiry <= nowSec) return { ok: false, code: "PolicyExpired" };
  if (amountIn <= 0n) return { ok: false, code: "InvalidAmount" };
  if (!recipientIsVault) return { ok: false, code: "WrongRecipient" };
  if (amountIn > maxPerTx) return { ok: false, code: "ExceedsPerTxCap" };
  if (spentUsdc(state) + amountIn > dailyCap) return { ok: false, code: "ExceedsDailyCap" };
  if (amountIn > balanceOf(state, "USDC")) return { ok: false, code: "InsufficientBalance" };
  return { ok: true };
}

const ATTACK_AMOUNT = 2_000_000_000n; // 2,000 USDC

export interface Plan {
  kind: JobKind;
  origin: JobOrigin;
  amountIn: bigint;
  recipient: Address;
  /** Intermediate statuses to play before the terminal one. */
  progress: JobStatus[];
  terminal: "confirmed" | "rejected" | "reverted";
  code: ReasonCode | null;
  /** Which pipeline stage the failure belongs to. */
  failAt: "precheck" | "onchain" | null;
  /** True when the attack skips the website, so Shield 1 never sees it. */
  skipsShield1: boolean;
  injected: boolean;
}

/** Turn a requested action into a deterministic outcome against the current vault state. */
export function planJob(spec: JobSpec, state: StateDto, safe: Address, nowSec: number): Plan {
  const base = { recipient: safe, injected: false, skipsShield1: false };
  if (spec.type === "rebalance") {
    const d = evaluateSwap(state, spec.amountIn, nowSec);
    return d.ok
      ? { ...base, kind: "swap", origin: "manual", amountIn: spec.amountIn, progress: ["queued", "prechecking", "simulating", "broadcasting"], terminal: "confirmed", code: null, failAt: null }
      : { ...base, kind: "swap", origin: "manual", amountIn: spec.amountIn, progress: ["queued", "prechecking"], terminal: "rejected", code: d.code, failAt: "precheck" };
  }
  if (spec.type === "injection") {
    // The text is data. It cannot change the verdict: the drain it asks for fails the same rules.
    const d = evaluateSwap(state, ATTACK_AMOUNT, nowSec, false);
    return { ...base, kind: "attack", origin: "redteam", amountIn: ATTACK_AMOUNT, recipient: ATTACKER, progress: ["queued", "prechecking"], terminal: "rejected", code: d.ok ? "ExceedsPerTxCap" : d.code, failAt: "precheck", injected: true };
  }
  switch (spec.scenario) {
    case "over-withdraw": {
      const d = evaluateSwap(state, ATTACK_AMOUNT, nowSec);
      return { ...base, kind: "attack", origin: "redteam", amountIn: ATTACK_AMOUNT, progress: ["queued", "prechecking"], terminal: "rejected", code: d.ok ? "ExceedsPerTxCap" : d.code, failAt: "precheck" };
    }
    case "wrong-recipient": {
      const d = evaluateSwap(state, 200_000_000n, nowSec, false);
      return { ...base, kind: "attack", origin: "redteam", amountIn: 200_000_000n, recipient: ATTACKER, progress: ["queued", "prechecking"], terminal: "rejected", code: d.ok ? "WrongRecipient" : d.code, failAt: "precheck" };
    }
    case "unlimited-approval":
      return { ...base, kind: "attack", origin: "redteam", amountIn: 0n, progress: ["queued", "prechecking"], terminal: "rejected", code: state.isActive ? "UnlimitedApproval" : "PolicyInactive", failAt: "precheck" };
    case "bypass":
      // Goes straight to the chain with a hand-set gas limit, so only the contract can stop it.
      return { ...base, kind: "attack", origin: "redteam", amountIn: ATTACK_AMOUNT, progress: ["queued", "broadcasting"], terminal: "reverted", code: state.isActive ? "ExceedsPerTxCap" : "PolicyInactive", failAt: "onchain", skipsShield1: true };
  }
}

/** Short title + one sentence per reason code. The real table is owned by the AI/shared contract work. */
export const REASONS: Record<ReasonCode, { title: string; sentence: string }> = {
  PolicyInactive: { title: "Policy is not active", sentence: "The vault is locked, so the agent cannot spend anything until the owner re-activates it." },
  PolicyExpired: { title: "Policy expired", sentence: "The policy passed its expiry date. The owner needs to set a new one." },
  InvalidAmount: { title: "Invalid amount", sentence: "The amount must be greater than zero." },
  ExceedsPerTxCap: { title: "Over the per-transaction cap", sentence: "This trade is larger than the most the agent may move in one transaction." },
  ExceedsDailyCap: { title: "Over the daily cap", sentence: "This trade would push today's total spending past the daily limit." },
  InsufficientBalance: { title: "Not enough balance", sentence: "The vault does not hold enough of this token for the trade." },
  WrongRecipient: { title: "Wrong recipient", sentence: "Proceeds must return to the vault. Any other recipient is refused." },
  UnlimitedApproval: { title: "Unlimited approval", sentence: "An unlimited allowance would let a router pull every token later, so it is refused before signing." },
};

export const reasonTitle = (code: string | null): string => (code && code in REASONS ? REASONS[code as ReasonCode].title : code ?? "Unknown reason");

/** Deterministic fake transaction hash so the same job id always links to the same place. */
export function fakeHash(seed: string): Hash {
  let h = 2166136261;
  let out = "";
  for (let i = 0; out.length < 64; i++) {
    h = Math.imul(h ^ (seed.charCodeAt(i % seed.length) + i), 16777619) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return `0x${out.slice(0, 64)}` as Hash;
}

export const txUrl = (hash: string): string => `${FUJI_EXPLORER}/tx/${hash}`;

function explain(plan: Plan, state: StateDto, outAmount: bigint, source: Explanation["source"]): Explanation {
  const pct = state.budgetUsedPct;
  if (plan.terminal === "confirmed") {
    return {
      verdict: "safe",
      budgetUsedPct: pct,
      source,
      messageVi: `Safe. ${formatTokenAmount(plan.amountIn, 6)} USDC became about ${formatTokenAmount(outAmount, 18, 3)} WAVAX in your vault, using ${formatPct(pct)} of today's limit.`,
    };
  }
  const reason = plan.code ? REASONS[plan.code] : null;
  const who = plan.terminal === "reverted" ? "Shield 2 (the contract) blocked this on-chain" : "Shield 1 blocked this before anything was signed";
  const inj = plan.injected ? " The instruction hidden in the text was ignored; the verdict comes from the rules only." : "";
  const bypass = plan.skipsShield1 ? " It skipped the website, but the rules live on-chain, so the contract still refused it." : "";
  return { verdict: "blocked", budgetUsedPct: pct, source, messageVi: `${who}. ${reason?.sentence ?? "The rules were not met."}${inj}${bypass}` };
}

/** Build the final job record for a plan. `state` is the state the plan was judged against. */
export function finalizeJob(args: { id: string; safe: Address; plan: Plan; state: StateDto; nowIso: string; createdAt: string; withExplanation: boolean; source?: Explanation["source"] }): JobDetailDto {
  const { id, safe, plan, state, nowIso, createdAt } = args;
  const out = plan.terminal === "confirmed" ? quoteWavaxOut(plan.amountIn) : 0n;
  const hasTx = plan.terminal !== "rejected";
  const hash = hasTx ? fakeHash(id) : null;
  const isSwap = plan.amountIn > 0n;
  const stateAfter: StateDto = plan.terminal === "confirmed" ? applyConfirmedSwap(state, plan.amountIn) : state;
  const audit: JobDetailDto["audit"] =
    plan.terminal === "confirmed"
      ? (["precheck", "simulation", "invariant", "onchain"] as const).map((shield) => ({ shield, result: "pass" as const, reason: null, ts: nowIso }))
      : plan.failAt === "precheck"
        ? [{ shield: "precheck" as const, result: "fail" as const, reason: plan.code, ts: nowIso }]
        : [{ shield: "onchain" as const, result: "fail" as const, reason: plan.code, ts: nowIso }];
  return {
    id,
    vault: safe,
    kind: plan.kind,
    origin: plan.origin,
    status: plan.terminal,
    intent: isSwap
      ? { tokenIn: USDC, tokenOut: WAVAX, amountIn: toAmount(plan.amountIn), minAmountOut: toAmount((quoteWavaxOut(plan.amountIn) * 98n) / 100n), recipient: plan.recipient, origin: plan.origin }
      : null,
    txHash: hash,
    explorerUrl: hash ? txUrl(hash) : null,
    revertError: plan.terminal === "reverted" ? plan.code : null,
    reasonCode: plan.terminal === "confirmed" ? null : plan.code,
    explanation: args.withExplanation ? explain(plan, stateAfter, out, args.source ?? "template") : null,
    createdAt,
    updatedAt: nowIso,
    precheck: plan.skipsShield1 ? null : { ok: plan.terminal === "confirmed", reasons: plan.code && plan.failAt === "precheck" ? [plan.code] : [] },
    sim:
      plan.terminal === "confirmed"
        ? { ok: true, deltaSafeTokenOut: toAmount(out), deltaSafeTokenIn: `-${plan.amountIn.toString()}`, attackerBalance: "0", allowanceAfter: "0" }
        : null,
    audit,
  };
}

/** Add an explanation to an already-terminal job (it arrives a moment after the verdict). */
export function explainTerminalJob(job: JobDetailDto, state: StateDto, plan: Plan, source: Explanation["source"] = "template"): JobDetailDto {
  const out = job.sim ? fromAmount(job.sim.deltaSafeTokenOut.replace("-", "")) : 0n;
  return { ...job, explanation: explain(plan, state, out, source) };
}

export function applyConfirmedSwap(state: StateDto, amountIn: bigint): StateDto {
  const out = quoteWavaxOut(amountIn);
  const spent = spentUsdc(state) + amountIn;
  const { dailyCap } = usdcLimit(state);
  const dayId = state.spentToday[0]?.dayId ?? 0;
  return {
    ...state,
    blockNumber: (BigInt(state.blockNumber) + 1n).toString(),
    balances: state.balances.map((b) =>
      b.symbol === "USDC" ? { ...b, amount: (fromAmount(b.amount) - amountIn).toString() } : b.symbol === "WAVAX" ? { ...b, amount: (fromAmount(b.amount) + out).toString() } : b,
    ),
    spentToday: [{ token: USDC, dayId, amount: spent.toString() }],
    budgetUsedPct: pctOf(spent, dailyCap),
  };
}

export function withBudget(state: StateDto): StateDto {
  return { ...state, budgetUsedPct: pctOf(spentUsdc(state), usdcLimit(state).dailyCap) };
}
