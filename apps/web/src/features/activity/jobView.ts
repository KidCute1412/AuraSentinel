import {
  JOB_TERMINAL_STATUSES,
  REASONS,
  explorerTxUrl,
  formatAmountVi,
  formatReasonVi,
  isReasonCode,
  type AuditEntry,
  type JobDto,
  type JobOrigin,
  type JobStatus,
  type ReasonCode,
  type StateDto,
} from "@agentshield/shared";

/**
 * Pure display model for one job (no React). Everything the timeline shows is derived here from
 * the server's JobDto, so the components only lay it out and the rules are unit-tested.
 * Money stays bigint until `formatAmountVi` turns it into a display string (P5).
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
  /** The server's original code when it is not in REASONS (shown as-is so nothing is hidden). */
  raw: string | null;
}

export interface JobView {
  id: string;
  status: JobStatus;
  tone: JobTone;
  terminal: boolean;
  /** Verdict stamp text; null while the job is still running. */
  stamp: "APPROVE" | "BLOCKED" | "LỖI" | null;
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

const ORIGIN: Record<JobOrigin, string> = { rebalancer: "Rebalancer", manual: "Thủ công", redteam: "Red-team" };

const STATUS: Record<JobStatus, { tone: JobTone; label: string; decider: Decider }> = {
  queued: { tone: "pending", label: "Đang chờ", decider: null },
  prechecking: { tone: "pending", label: "Shield 1 · kiểm tra", decider: null },
  simulating: { tone: "pending", label: "Shield 1 · chạy thử", decider: null },
  broadcasting: { tone: "pending", label: "Đang gửi lên chain", decider: null },
  confirmed: { tone: "ok", label: "Đã khớp", decider: "both" },
  rejected: { tone: "danger", label: "Shield 1 chặn", decider: "shield1" },
  reverted: { tone: "danger", label: "Shield 2 chặn", decider: "shield2" },
  failed: { tone: "warn", label: "Lỗi hạ tầng", decider: "infra" },
};

const DECIDER_LABEL: Record<Exclude<Decider, null>, string> = {
  shield1: "Chặn ngoài chain · không gửi tx, không tốn gas",
  shield2: "Contract chặn trên chain · tx bị revert, tiền không đi",
  both: "Qua cả hai lớp khiên",
  infra: "RPC lỗi sau khi thử lại · không phải bị chặn",
};

const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

/** Base units -> "2.000 USDC"; unknown token -> grouped base units, labelled as such. */
export function formatTokenAmount(amount: string, token: string, tokens: TokenBook): string {
  const meta = tokens.get(token.toLowerCase());
  const value = BigInt(amount);
  return meta ? formatAmountVi(value, meta.decimals, meta.symbol) : `${formatAmountVi(value, 0)} đơn vị gốc`;
}

const symbolOf = (token: string, tokens: TokenBook) => tokens.get(token.toLowerCase())?.symbol ?? short(token);

export function reasonOf(code: string | null | undefined, params: { amount?: string } = {}): JobReason {
  const known = isReasonCode(code) ? code : "UNKNOWN_REVERT";
  return {
    code: known,
    title: REASONS[known].title,
    message: formatReasonVi(known, params),
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
  const of = amount ? ` lệnh ${amount}` : " lệnh";
  switch (status) {
    case "confirmed":
      return amount ? `Đã khớp lệnh ${amount}` : "Lệnh đã khớp";
    case "rejected":
      return `Shield 1 chặn${of}`;
    case "reverted":
      return `Shield 2 chặn${of}`;
    case "failed":
      return "Lệnh lỗi hạ tầng";
    case "queued":
      return "Đang chờ trong hàng đợi";
    case "prechecking":
      return "Shield 1 đang kiểm tra";
    case "simulating":
      return "Shield 1 đang chạy thử";
    case "broadcasting":
      return "Đang gửi lên chain";
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
    stamp: job.status === "confirmed" ? "APPROVE" : blocked ? "BLOCKED" : job.status === "failed" ? "LỖI" : null,
    statusLabel: s.label,
    title: titleOf(job.status, amount),
    decider: s.decider,
    deciderLabel: s.decider ? DECIDER_LABEL[s.decider] : null,
    origin: job.kind === "attack" ? `${ORIGIN[job.origin]} · tấn công` : ORIGIN[job.origin],
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
  { shield: "simulation", label: "Shield 1 · chạy thử" },
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

/** Explanation.budgetUsedPct (0-100, display only) -> "13,3%". */
export function formatPctVi(pct: number): string {
  const tenths = Math.round(Math.min(Math.max(pct, 0), 100) * 10);
  const whole = Math.trunc(tenths / 10);
  const tenth = tenths % 10;
  return tenth === 0 ? `${whole}%` : `${whole},${tenth}%`;
}
