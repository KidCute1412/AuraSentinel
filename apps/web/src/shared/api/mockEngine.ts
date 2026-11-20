import { getAddress } from "viem";
import {
  AGENT_FEED_MAX,
  agentFlags,
  FUJI_EXPLORER,
  fromAmount,
  parseUnits,
  planFromRules,
  toAmount,
  type Address,
  type AgentAction,
  type AgentPlan,
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

/**
 * Address of a token in this state, found by symbol in the chain-sourced balances, so the same helpers read a live
 * StateDto (real token addresses) and a simulated one. Falls back to the simulated address.
 */
export const tokenAddressIn = (state: StateDto, symbol: TokenSymbol): string =>
  state.balances.find((b) => b.symbol === symbol)?.token ?? TOKENS[symbol].address;

export function spentUsdc(state: StateDto): bigint {
  const usdc = tokenAddressIn(state, "USDC").toLowerCase();
  const row = state.spentToday.find((s) => s.token.toLowerCase() === usdc);
  return row ? fromAmount(row.amount) : 0n;
}

export function usdcLimit(state: StateDto): { maxPerTx: bigint; dailyCap: bigint } {
  const usdc = tokenAddressIn(state, "USDC").toLowerCase();
  const l = state.policy.limits.find((x) => x.token.toLowerCase() === usdc);
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
  | "RECIPIENT_NOT_SAFE"
  | "ZeroMinOut"
  | "GS104";

export type Decision = { ok: true } | { ok: false; code: ReasonCode };

/**
 * Shield 1 pre-check for a USDC -> WAVAX swap. The first failing rule wins, in the same order as the server's
 * precheck (auditor/domain/precheck.ts): policy, caps, then the recipient. Codes match @agentshield/shared REASONS
 * where one exists, so swapping this mock for the real API keeps every label.
 */
export function evaluateSwap(state: StateDto, amountIn: bigint, nowSec: number, recipientIsVault = true): Decision {
  const { maxPerTx, dailyCap } = usdcLimit(state);
  if (!state.isActive) return { ok: false, code: "PolicyInactive" };
  if (state.policy.expiry <= nowSec) return { ok: false, code: "PolicyExpired" };
  if (amountIn <= 0n) return { ok: false, code: "InvalidAmount" };
  if (amountIn > maxPerTx) return { ok: false, code: "ExceedsPerTxCap" };
  if (spentUsdc(state) + amountIn > dailyCap) return { ok: false, code: "ExceedsDailyCap" };
  if (!recipientIsVault) return { ok: false, code: "RECIPIENT_NOT_SAFE" };
  if (amountIn > balanceOf(state, "USDC")) return { ok: false, code: "InsufficientBalance" };
  return { ok: true };
}

const ATTACK_AMOUNT = 2_000_000_000n; // 2,000 USDC

export interface Plan {
  kind: JobKind;
  origin: JobOrigin;
  amountIn: bigint;
  recipient: Address;
  /** What the swap spends and buys (USDC -> WAVAX unless a hijacked agent picked otherwise). */
  tokenIn: Address;
  tokenOut: Address;
  /** Intermediate statuses to play before the terminal one. */
  progress: JobStatus[];
  terminal: "confirmed" | "rejected" | "reverted" | "held";
  code: ReasonCode | null;
  /** Every Shield 1 rule that failed, first one = `code` (the precheck list on the job page). */
  reasons: ReasonCode[];
  /** Which pipeline stage the failure belongs to. */
  failAt: "precheck" | "onchain" | null;
  /** True when the attack skips the website, so Shield 1 never sees it. */
  skipsShield1: boolean;
  injected: boolean;
  /** Hijacked Agent runs: the brain's plan (the shared keyword planner here, the server may use an LLM). */
  agentPlan: AgentPlan | null;
  /** Where a held plan stopped: after Shield 1 (a swap), after a chain dry run (direct), or nothing to do. */
  heldVia: "shield1" | "onchain" | "none" | null;
  /** The server sends no swap intent for on-chain plans (approve, direct): neither does the mock. */
  noIntent: boolean;
  /** JobDto.scenario: which attack, null for a trade. */
  scenario: string | null;
}

const DECIMALS = { USDC: 6, WAVAX: 18 } as const;

/** "12.3456789" -> base units, extra precision cut (never rounded up), like the server's toBaseUnits. */
function baseUnits(decimal: string, decimals: number): bigint {
  const [whole = "0", frac = ""] = decimal.split(".");
  const cut = frac.slice(0, decimals);
  return parseUnits(cut ? `${whole}.${cut}` : whole, decimals);
}

/** The vault's per-transaction cap for a token, base units (0 when the token has no limit). */
function capOf(state: StateDto, symbol: TokenSymbol): bigint {
  const token = tokenAddressIn(state, symbol).toLowerCase();
  const l = state.policy.limits.find((x) => x.token.toLowerCase() === token);
  return l ? fromAmount(l.maxPerTx) : 0n;
}

/**
 * Hijacked Agent: the keyword brain (shared with the server's fallback) turns the visitor's text into a plan, and the
 * same rules as everywhere judge it. A plan inside the policy is held, never "sent": red-team runs move no money.
 */
function planHijack(text: string, state: StateDto, safe: Address, nowSec: number): Plan {
  const feed = text.replace(/[<>`]/g, " ").replace(/\s+/g, " ").trim().slice(0, AGENT_FEED_MAX);
  const brain = planFromRules(feed);
  const a: AgentAction = brain.action;
  const tokenIn = a.type === "swap" || a.type === "direct" ? a.tokenIn : "USDC";
  const tokenOut = a.type === "swap" || a.type === "direct" ? a.tokenOut : "WAVAX";
  const amountIn = a.type === "swap" || a.type === "direct" ? (a.amount === "all" ? balanceOf(state, tokenIn) : baseUnits(a.amount, DECIMALS[tokenIn])) : 0n;
  const maxPerTx = capOf(state, tokenIn);
  const flags = agentFlags(a, a.type === "approve" || a.type === "none" ? {} : { amountIn, maxPerTx, balance: balanceOf(state, tokenIn) });
  const agentPlan: AgentPlan = { source: "rules", model: null, feed, thought: brain.thought, action: a, flags, fallbackReason: "off" };
  const base = {
    kind: "attack" as const,
    origin: "redteam" as const,
    amountIn,
    recipient: a.type === "swap" && a.recipient !== "vault" ? a.recipient : safe,
    tokenIn: tokenAddressIn(state, tokenIn) as Address,
    tokenOut: tokenAddressIn(state, tokenOut) as Address,
    injected: true,
    agentPlan,
    reasons: [] as ReasonCode[],
    code: null,
    failAt: null,
    skipsShield1: false,
    heldVia: null,
    noIntent: a.type !== "swap",
    scenario: "prompt-injection",
  };
  const spentToday = tokenIn === "USDC" ? spentUsdc(state) : 0n;
  const dailyCap = tokenIn === "USDC" ? usdcLimit(state).dailyCap : maxPerTx * 3n;

  switch (a.type) {
    case "none":
      return { ...base, progress: ["queued"], terminal: "held", heldVia: "none" };
    case "approve":
      // The agent key is not an enabled module of the Safe: GS104 on-chain, whatever the policy says.
      return { ...base, progress: ["queued", "broadcasting"], terminal: "reverted", code: "GS104", failAt: "onchain", skipsShield1: true };
    case "direct": {
      const code: ReasonCode | null = !state.isActive
        ? "PolicyInactive"
        : amountIn > maxPerTx
          ? "ExceedsPerTxCap"
          : spentToday + amountIn > dailyCap
            ? "ExceedsDailyCap"
            : null;
      return code
        ? { ...base, progress: ["queued", "broadcasting"], terminal: "reverted", code, failAt: "onchain", skipsShield1: true }
        : { ...base, progress: ["queued"], terminal: "held", heldVia: "onchain", skipsShield1: true };
    }
    case "swap": {
      const reasons: ReasonCode[] = [];
      if (!state.isActive) reasons.push("PolicyInactive");
      if (state.policy.expiry <= nowSec) reasons.push("PolicyExpired");
      if (amountIn <= 0n) reasons.push("InvalidAmount");
      if (amountIn > maxPerTx) reasons.push("ExceedsPerTxCap");
      if (spentToday + amountIn > dailyCap) reasons.push("ExceedsDailyCap");
      if (a.recipient !== "vault") reasons.push("RECIPIENT_NOT_SAFE");
      if (a.maxSlippagePct >= 100) reasons.push("ZeroMinOut");
      if (amountIn > balanceOf(state, tokenIn)) reasons.push("InsufficientBalance");
      return reasons.length > 0
        ? { ...base, reasons, progress: ["queued", "prechecking"], terminal: "rejected", code: reasons[0]!, failAt: "precheck" }
        : { ...base, progress: ["queued", "prechecking", "simulating"], terminal: "held", heldVia: "shield1" };
    }
  }
}

/** Turn a requested action into a deterministic outcome against the current vault state. */
export function planJob(spec: JobSpec, state: StateDto, safe: Address, nowSec: number): Plan {
  const base = {
    recipient: safe,
    injected: false,
    skipsShield1: false,
    tokenIn: USDC,
    tokenOut: WAVAX,
    reasons: [] as ReasonCode[],
    agentPlan: null,
    heldVia: null,
    noIntent: false,
    scenario: spec.type === "attack" ? spec.scenario : null,
  };
  if (spec.type === "rebalance") {
    const d = evaluateSwap(state, spec.amountIn, nowSec);
    return d.ok
      ? { ...base, kind: "swap", origin: "manual", amountIn: spec.amountIn, progress: ["queued", "prechecking", "simulating", "broadcasting"], terminal: "confirmed", code: null, failAt: null }
      : { ...base, kind: "swap", origin: "manual", amountIn: spec.amountIn, progress: ["queued", "prechecking"], terminal: "rejected", code: d.code, reasons: [d.code], failAt: "precheck" };
  }
  if (spec.type === "injection") return planHijack(spec.text, state, safe, nowSec);
  switch (spec.scenario) {
    case "over-withdraw": {
      const d = evaluateSwap(state, ATTACK_AMOUNT, nowSec);
      return { ...base, kind: "attack", origin: "redteam", amountIn: ATTACK_AMOUNT, progress: ["queued", "prechecking"], terminal: "rejected", code: d.ok ? "ExceedsPerTxCap" : d.code, failAt: "precheck" };
    }
    case "wrong-recipient": {
      const d = evaluateSwap(state, 200_000_000n, nowSec, false);
      return { ...base, kind: "attack", origin: "redteam", amountIn: 200_000_000n, recipient: ATTACKER, progress: ["queued", "prechecking"], terminal: "rejected", code: d.ok ? "RECIPIENT_NOT_SAFE" : d.code, failAt: "precheck" };
    }
    case "unlimited-approval":
      // The session key calls safe.execTransactionFromModule(approve(MAX)) itself. The agent EOA is not an enabled
      // module, so the Safe reverts with GS104 on-chain whatever the policy says: there is a tx to show, no allowance.
      return { ...base, kind: "attack", origin: "redteam", amountIn: 0n, progress: ["queued", "broadcasting"], terminal: "reverted", code: "GS104", failAt: "onchain", skipsShield1: true };
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
  RECIPIENT_NOT_SAFE: { title: "Recipient is not the vault", sentence: "Proceeds must return to the vault. Any other recipient is refused." },
  ZeroMinOut: { title: "No minimum output", sentence: "A trade at any price is refused: it must name the least it will accept." },
  GS104: { title: "Refused by the Safe (GS104)", sentence: "The agent key is not an enabled module of the Safe, so the Safe refused the call. No allowance was granted." },
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
  if (plan.terminal === "held") {
    return { verdict: "safe", budgetUsedPct: pct, source: "template", messageVi: "Held. Inside the policy, so every shield let it through, but red-team runs are never sent." };
  }
  if (plan.terminal === "confirmed") {
    return {
      verdict: "safe",
      budgetUsedPct: pct,
      source,
      messageVi: `Safe. ${formatTokenAmount(plan.amountIn, 6)} USDC became about ${formatTokenAmount(outAmount, 18, 3)} WAVAX in your vault, using ${formatPct(pct)} of today's limit.`,
    };
  }
  const reason = plan.code ? REASONS[plan.code] : null;
  const bySafe = plan.code === "GS104";
  const who = bySafe
    ? "The Safe blocked this on-chain"
    : plan.terminal === "reverted"
      ? "Shield 2 (the contract) blocked this on-chain"
      : "Shield 1 blocked this before anything was signed";
  const inj = plan.injected ? " The hijacked agent's plan was judged by the same rules as any trade." : "";
  const bypass = !plan.skipsShield1
    ? ""
    : bySafe
      ? " Skipping the website does not help: the Safe checks the caller itself."
      : " It skipped the website, but the rules live on-chain, so the contract still refused it.";
  return { verdict: "blocked", budgetUsedPct: pct, source, messageVi: `${who}. ${reason?.sentence ?? "The rules were not met."}${inj}${bypass}` };
}

/** Build the final job record for a plan. `state` is the state the plan was judged against. */
export function finalizeJob(args: { id: string; safe: Address; plan: Plan; state: StateDto; nowIso: string; createdAt: string; withExplanation: boolean; source?: Explanation["source"] }): JobDetailDto {
  const { id, safe, plan, state, nowIso, createdAt } = args;
  const simulated = plan.terminal === "confirmed" || plan.heldVia === "shield1";
  const out = simulated ? quoteWavaxOut(plan.amountIn) : 0n;
  const hasTx = plan.terminal === "confirmed" || plan.terminal === "reverted";
  const hash = hasTx ? fakeHash(id) : null;
  const isSwap = plan.amountIn > 0n && !plan.noIntent;
  const stateAfter: StateDto = plan.terminal === "confirmed" ? applyConfirmedSwap(state, plan.amountIn) : state;
  const pass = (shield: JobDetailDto["audit"][number]["shield"]) => ({ shield, result: "pass" as const, reason: null, ts: nowIso, checks: [] });
  const audit: JobDetailDto["audit"] =
    plan.terminal === "confirmed"
      ? (["precheck", "simulation", "invariant", "onchain"] as const).map(pass)
      : plan.heldVia === "shield1"
        ? (["precheck", "simulation", "invariant"] as const).map(pass)
        : plan.heldVia === "onchain"
          ? [{ ...pass("onchain"), checks: [{ id: "tx-dry-run", pass: true, reasonCode: null, actual: { type: "text" as const, value: "accepted" }, limit: null }] }]
          : plan.heldVia === "none"
            ? []
            : plan.failAt === "precheck"
        ? [{ shield: "precheck" as const, result: "fail" as const, reason: plan.code, ts: nowIso, checks: [] }]
        : [{ shield: "onchain" as const, result: "fail" as const, reason: plan.code, ts: nowIso, checks: [] }];
  return {
    id,
    vault: safe,
    kind: plan.kind,
    origin: plan.origin,
    status: plan.terminal,
    intent: isSwap
      ? { tokenIn: plan.tokenIn, tokenOut: plan.tokenOut, amountIn: toAmount(plan.amountIn), minAmountOut: toAmount((quoteWavaxOut(plan.amountIn) * 98n) / 100n), recipient: plan.recipient, origin: plan.origin }
      : null,
    txHash: hash,
    explorerUrl: hash ? txUrl(hash) : null,
    revertError: plan.terminal === "reverted" ? plan.code : null,
    reasonCode: plan.terminal === "confirmed" ? null : plan.code,
    explanation: args.withExplanation ? explain(plan, stateAfter, out, args.source ?? "template") : null,
    agentPlan: plan.agentPlan,
    scenario: plan.scenario,
    createdAt,
    updatedAt: nowIso,
    precheck:
      plan.skipsShield1 || plan.heldVia === "none"
        ? null
        : { ok: plan.terminal !== "rejected", reasons: plan.failAt === "precheck" ? (plan.reasons.length ? plan.reasons : plan.code ? [plan.code] : []) : [] },
    sim:
      simulated
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
