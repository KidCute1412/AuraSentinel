import {
  JOB_TERMINAL_STATUSES,
  explorerTxUrl,
  isReasonCode,
  type AuditEntry,
  type JobDto,
  type JobOrigin,
  type JobStatus,
  type ReasonCode,
  type StateDto,
} from "@agentshield/shared";
import { formatTokenAmount as formatUnitsEn } from "@/shared/lib/format";
import { REASON_COPY, formatReason } from "@/shared/lib/reasonCopy";

/**
 * Pure display model for one job (no React). Everything the timeline shows is derived here from
 * the server's JobDto, so the components only lay it out and the rules are unit-tested.
 * Money stays bigint until `formatUnitsEn` turns it into an en-US display string (P5).
 */

export interface TokenMeta {
  symbol: string;
  decimals: number;
}
/** Keyed by lower-case token address. */
export type TokenBook = ReadonlyMap<string, TokenMeta>;

/** Symbols and decimals come from the chain-sourced vault state (`balances`), not from a hard-coded list. */
export function tokenBook(state: StateDto | undefined): TokenBook {
  return new Map((state?.balances ?? []).map((b) => [b.token.toLowerCase(), { symbol: b.symbol, decimals: b.decimals }]));
}

export type JobTone = "ok" | "danger" | "warn" | "pending";

/** Who made the final call: Shield 1 (off-chain), Shield 2 (on-chain), both let it through, or infra failed. */
export type Decider = "shield1" | "shield2" | "both" | "infra" | null;

export interface JobReason {
  code: ReasonCode;
  title: string;
  message: string;
  /** The server's original code when it is not a known reason code (shown as-is so nothing is hidden). */
  raw: string | null;
}

export interface JobView {
  id: string;
  status: JobStatus;
  tone: JobTone;
  terminal: boolean;
  /** Verdict stamp text; null while the job is still running. */
  stamp: "APPROVE" | "BLOCKED" | "ERROR" | null;
  /** Short mono status line, security-report voice. */
  statusLabel: string;
  title: string;
  decider: Decider;
  deciderLabel: string | null;
  origin: string;
  amount: string | null;
  route: string | null;
  reason: JobReason | null;
  txUrl: string | null;
  time: string;
}

const ORIGIN: Record<JobOrigin, string> = { rebalancer: "Rebalancer", manual: "Manual", redteam: "Red-team" };

const STATUS: Record<JobStatus, { tone: JobTone; label: string; decider: Decider }> = {
  queued: { tone: "pending", label: "Queued", decider: null },
  prechecking: { tone: "pending", label: "Shield 1 · precheck", decider: null },
  simulating: { tone: "pending", label: "Shield 1 · simulation", decider: null },
  broadcasting: { tone: "pending", label: "Sending to chain", decider: null },
  confirmed: { tone: "ok", label: "Confirmed", decider: "both" },
  rejected: { tone: "danger", label: "Blocked by Shield 1", decider: "shield1" },
  reverted: { tone: "danger", label: "Blocked by Shield 2", decider: "shield2" },
  failed: { tone: "warn", label: "Infra error", decider: "infra" },
};

const DECIDER_LABEL: Record<Exclude<Decider, null>, string> = {
  shield1: "Blocked off-chain · no transaction sent, no gas spent",
  shield2: "The contract blocked it on-chain · transaction reverted, no funds moved",
  both: "Passed both shields",
  infra: "RPC failed after retries · this is not a block",
};

const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

/** Base units -> "2,000 USDC"; unknown token -> grouped base units, labelled as such. */
export function formatTokenAmount(amount: string, token: string, tokens: TokenBook): string {
  const meta = tokens.get(token.toLowerCase());
  const value = BigInt(amount);
  return meta ? `${formatUnitsEn(value, meta.decimals)} ${meta.symbol}` : `${formatUnitsEn(value, 0)} base units`;
}

const symbolOf = (token: string, tokens: TokenBook) => tokens.get(token.toLowerCase())?.symbol ?? short(token);

export function reasonOf(code: string | null | undefined, params: { amount?: string } = {}): JobReason {
  const known = isReasonCode(code) ? code : "UNKNOWN_REVERT";
  return {
    code: known,
    title: REASON_COPY[known].title,
    message: formatReason(known, params),
    raw: code && !isReasonCode(code) ? code : null,
  };
}

/** HH:MM:SS in the viewer's time zone (display only). */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

function titleOf(status: JobStatus, amount: string | null): string {
  const order = amount ? `the ${amount} order` : "the order";
  switch (status) {
    case "confirmed":
      return amount ? `Swapped ${amount}` : "Swap confirmed";
    case "rejected":
      return `Shield 1 blocked ${order}`;
    case "reverted":
      return `Shield 2 blocked ${order}`;
    case "failed":
      return "Order failed on infrastructure";
    case "queued":
      return "Waiting in the queue";
    case "prechecking":
      return "Shield 1 is checking";
    case "simulating":
      return "Shield 1 is simulating";
    case "broadcasting":
      return "Sending to chain";
  }
}

export function jobView(job: JobDto, tokens: TokenBook): JobView {
  const s = STATUS[job.status];
  const intent = job.intent;
  const amount = intent ? formatTokenAmount(intent.amountIn, intent.tokenIn, tokens) : null;
  const blocked = job.status === "rejected" || job.status === "reverted";
  const code = job.reasonCode ?? job.revertError;
  return {
    id: job.id,
    status: job.status,
    tone: s.tone,
    terminal: JOB_TERMINAL_STATUSES.includes(job.status),
    stamp: job.status === "confirmed" ? "APPROVE" : blocked ? "BLOCKED" : job.status === "failed" ? "ERROR" : null,
    statusLabel: s.label,
    title: titleOf(job.status, amount),
    decider: s.decider,
    deciderLabel: s.decider ? DECIDER_LABEL[s.decider] : null,
    origin: job.kind === "attack" ? `${ORIGIN[job.origin]} · attack` : ORIGIN[job.origin],
    amount,
    route: intent ? `${symbolOf(intent.tokenIn, tokens)} → ${symbolOf(intent.tokenOut, tokens)}` : null,
    reason: blocked ? reasonOf(code, { amount: amount ?? undefined }) : null,
    txUrl: job.explorerUrl ?? (job.txHash ? explorerTxUrl(job.txHash) : null),
    time: formatTime(job.createdAt),
  };
}

/** The four audit stages in pipeline order (api.md #11). A stage with no row did not run. */
export const AUDIT_STAGES: readonly { shield: AuditEntry["shield"]; label: string }[] = [
  { shield: "precheck", label: "Shield 1 · precheck" },
  { shield: "simulation", label: "Shield 1 · simulation" },
  { shield: "invariant", label: "Shield 1 · invariants" },
  { shield: "onchain", label: "Shield 2 · on-chain" },
];

export interface StageView {
  label: string;
  result: "pass" | "fail" | "skipped";
  reason: string | null;
}

export function stageViews(audit: readonly AuditEntry[]): StageView[] {
  return AUDIT_STAGES.map(({ shield, label }) => {
    const row = [...audit].reverse().find((a) => a.shield === shield);
    if (!row) return { label, result: "skipped", reason: null };
    return { label, result: row.result, reason: row.result === "fail" ? reasonOf(row.reason).title : null };
  });
}

/** Explanation.budgetUsedPct (0-100, display only) -> "13.3%" (en-US, trailing ".0" dropped). */
export function formatBudgetPct(pct: number): string {
  const tenths = Math.round(Math.min(Math.max(pct, 0), 100) * 10);
  const whole = Math.trunc(tenths / 10);
  const tenth = tenths % 10;
  return tenth === 0 ? `${whole}%` : `${whole}.${tenth}%`;
}
