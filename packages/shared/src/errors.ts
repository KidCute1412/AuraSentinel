import { z } from 'zod';
import { formatUnits } from './money';

/** HTTP error codes from api.md. Revert reason codes + Vietnamese copy live further down (AIE-owned). */
export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  NOT_OWNER: 403,
  NOT_ADMIN: 403,
  VAULT_NOT_FOUND: 404,
  JOB_NOT_FOUND: 404,
  QUEUE_BUSY: 409,
  RATE_LIMITED: 429,
  COOLDOWN: 429,
  AGENT_LOW_GAS: 503,
  CHAIN_UNAVAILABLE: 503,
} as const;
export type ErrorCode = keyof typeof ERROR_CODES;

const codes = Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]];

/** RFC 9457 problem+json. `type` is a relative URI (no domain; the demo runs locally). */
export const ProblemDetails = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  code: z.enum(codes),
  reason: z.string().nullable().optional(),
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetails>;

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export const problem = (
  code: ErrorCode,
  title: string,
  detail?: string,
  extra: Partial<ProblemDetails> = {},
): ProblemDetails => ({
  type: `/errors/${code.toLowerCase().replace(/_/g, '-')}`,
  title,
  status: ERROR_CODES[code],
  detail,
  code,
  reason: null,
  ...extra,
});

// ---------------------------------------------------------------------------
// Reason codes (D6): why a swap was blocked, plus the Vietnamese copy shown to users.
//
// Naming tells you where a code comes from:
//   PascalCase       custom error of AgentPolicyModule (contracts.md §4). Precheck and the
//                    simulator mirror these gates and return the same name.
//   GS###            Safe core error (GS104 = caller is not an enabled module, attack #3).
//   SCREAMING_SNAKE  off-chain only: intent checks the ABI cannot express, post-sim
//                    invariants, and the UNKNOWN_REVERT fallback.
//
// Copy rules: messageVi may contain {placeholders} filled with already formatted values
// (see formatAmountVi). Any template with placeholders must also have a number-free
// fallbackVi, used when a value is missing, so a message is always available.
// ---------------------------------------------------------------------------

export const REASON_PARAMS = [
  'amount',
  'maxPerTx',
  'dailyCap',
  'spent',
  'token',
  'expiry',
  'minOut',
  'recipient',
  'actual',
] as const;
export type ReasonParam = (typeof REASON_PARAMS)[number];
export type ReasonParams = Partial<Record<ReasonParam, string>>;

/** contract = AgentPolicyModule custom error · safe = Safe core · intent = precheck-only · invariant = post-sim. */
export type ReasonKind = 'contract' | 'safe' | 'intent' | 'invariant' | 'unknown';

export interface ReasonEntry {
  kind: ReasonKind;
  /** Short label for chips and timeline rows. No numbers. */
  title: string;
  /** Full sentence, may contain {placeholders}. Max 280 chars once filled (Explanation.messageVi). */
  messageVi: string;
  /** Number-free sentence; required when messageVi has placeholders. */
  fallbackVi?: string;
}

export const REASONS = {
  // Gate 1: who and when
  UnauthorizedAgent: {
    kind: 'contract',
    title: 'Sai ví agent',
    messageVi:
      'Lệnh không được ký bằng ví agent mà chủ két cho phép, nên bị từ chối. Không có tiền nào rời két.',
  },
  PolicyInactive: {
    kind: 'contract',
    title: 'Agent đang bị khoá',
    messageVi:
      'Agent đang bị khoá bằng Kill-Switch. Mọi lệnh bị chặn cho tới khi chủ két ký kích hoạt lại.',
  },
  PolicyExpired: {
    kind: 'contract',
    title: 'Quyền agent đã hết hạn',
    messageVi:
      'Quyền giao dịch của agent đã hết hạn lúc {expiry}. Chủ két cần ký chính sách mới để agent chạy tiếp.',
    fallbackVi:
      'Quyền giao dịch của agent đã hết hạn. Chủ két cần ký chính sách mới để agent chạy tiếp.',
  },
  // Gate 2: which tokens
  TokenNotWhitelisted: {
    kind: 'contract',
    title: 'Token không được phép',
    messageVi: 'Token {token} không nằm trong danh sách chủ két cho phép giao dịch.',
    fallbackVi: 'Token này không nằm trong danh sách chủ két cho phép giao dịch.',
  },
  SameToken: {
    kind: 'contract',
    title: 'Hai token giống nhau',
    messageVi: 'Token bán và token mua giống nhau nên lệnh không hợp lệ.',
  },
  // Gate 3-4: how much
  ExceedsPerTxCap: {
    kind: 'contract',
    title: 'Vượt hạn mức mỗi lệnh',
    messageVi: 'Lệnh {amount} vượt hạn mức mỗi lệnh là {maxPerTx}.',
    fallbackVi: 'Lệnh vượt hạn mức tối đa cho một lần giao dịch.',
  },
  ExceedsDailyCap: {
    kind: 'contract',
    title: 'Vượt hạn mức ngày',
    messageVi: 'Hôm nay đã dùng {spent} trên {dailyCap}. Thêm {amount} sẽ vượt hạn mức ngày.',
    fallbackVi: 'Lệnh này làm vượt hạn mức chi tiêu trong ngày.',
  },
  ZeroMinOut: {
    kind: 'contract',
    title: 'Thiếu mức nhận tối thiểu',
    messageVi:
      'Lệnh không đặt mức nhận tối thiểu (minOut = 0) nên dễ bị thao túng giá. Lệnh bị chặn.',
  },
  DeadlineTooFar: {
    kind: 'contract',
    title: 'Hạn chót quá xa',
    messageVi:
      'Hạn chót của lệnh xa hơn 10 phút. Lệnh bị chặn để không bị giữ lại rồi khớp ở giá xấu.',
  },
  // Gate 5: execution
  SwapFailed: {
    kind: 'contract',
    title: 'Sàn từ chối swap',
    messageVi:
      'Sàn giao dịch từ chối lệnh swap. Giao dịch được hoàn tác, không có tiền nào rời két.',
  },
  InsufficientOutput: {
    kind: 'contract',
    title: 'Nhận về quá ít',
    messageVi: 'Số nhận về thấp hơn mức tối thiểu {minOut}. Lệnh bị huỷ để tránh trượt giá.',
    fallbackVi: 'Số nhận về thấp hơn mức tối thiểu. Lệnh bị huỷ để tránh trượt giá.',
  },
  ResidualAllowance: {
    kind: 'contract',
    title: 'Còn quyền rút sau swap',
    messageVi:
      'Sau swap vẫn còn quyền rút tiền chưa thu hồi. Lệnh bị huỷ để không ai rút thêm được từ két.',
  },

  // Owner functions and the reentrancy guard. The swap pipeline never sees these (the agent cannot call
  // setPolicy or revoke); they show up when a wallet signs a bad owner transaction, so the UI can explain it.
  NotOwner: {
    kind: 'contract',
    title: 'Không phải chủ két',
    messageVi: 'Chỉ ví chủ két mới được đổi chính sách hoặc bật Kill-Switch. Giao dịch bị từ chối.',
  },
  InvalidPolicy: {
    kind: 'contract',
    title: 'Chính sách không hợp lệ',
    messageVi:
      'Chính sách bị từ chối: ví agent hoặc router trống, hạn dùng đã qua, hoặc hạn mức token không hợp lệ.',
  },
  Reentrancy: {
    kind: 'contract',
    title: 'Gọi lồng nhau',
    messageVi: 'Module từ chối lệnh gọi lồng nhau trong lúc đang swap. Không có tiền nào rời két.',
  },
  // Factory (wizard /vaults/new)
  NotSafeOwner: {
    kind: 'contract',
    title: 'Không phải chủ Safe',
    messageVi: 'Chỉ chủ của Safe này mới được tạo module bảo vệ cho nó. Yêu cầu bị từ chối.',
  },
  ModuleExists: {
    kind: 'contract',
    title: 'Safe đã có module',
    messageVi: 'Safe này đã có module bảo vệ nên yêu cầu tạo lại bị từ chối.',
  },

  // Safe core
  GS104: {
    kind: 'safe',
    title: 'Safe từ chối (GS104)',
    messageVi:
      'Ví gọi lệnh không phải module được két bật, nên Safe từ chối (GS104). Agent không thể tự cấp quyền rút tiền.',
  },

  // Off-chain intent checks: the module ABI has no recipient field, so only precheck can see this.
  RECIPIENT_NOT_SAFE: {
    kind: 'intent',
    title: 'Người nhận không phải két',
    messageVi:
      'Lệnh muốn gửi tiền tới {recipient} thay vì két. Trên chain, người nhận luôn bị khoá cứng là két.',
    fallbackVi:
      'Lệnh muốn gửi tiền ra ngoài két. Trên chain, người nhận luôn bị khoá cứng là két.',
  },

  // Post-simulation invariants: a sim that does not revert is not automatically safe.
  INVARIANT_NO_OUTPUT: {
    kind: 'invariant',
    title: 'Két không nhận được token',
    messageVi:
      'Chạy thử cho thấy két không nhận được token mua về. Lệnh bị chặn trước khi gửi.',
  },
  INVARIANT_INPUT_MISMATCH: {
    kind: 'invariant',
    title: 'Số tiền rời két sai',
    messageVi:
      'Chạy thử cho thấy két mất {actual} thay vì đúng {amount}. Lệnh bị chặn trước khi gửi.',
    fallbackVi:
      'Chạy thử cho thấy số tiền rời két khác với số trong lệnh. Lệnh bị chặn trước khi gửi.',
  },
  INVARIANT_ATTACKER_GAINED: {
    kind: 'invariant',
    title: 'Ví lạ nhận được tiền',
    messageVi: 'Chạy thử cho thấy có ví lạ nhận được tiền. Lệnh bị chặn trước khi gửi.',
  },
  INVARIANT_ALLOWANCE_LEFT: {
    kind: 'invariant',
    title: 'Còn quyền rút sau chạy thử',
    messageVi:
      'Chạy thử cho thấy sau swap vẫn còn quyền rút tiền chưa thu hồi. Lệnh bị chặn trước khi gửi.',
  },

  // Anything the revert decoder cannot map.
  UNKNOWN_REVERT: {
    kind: 'unknown',
    title: 'Lỗi chưa xác định',
    messageVi: 'Lệnh bị từ chối vì một lỗi chưa xác định. Không có tiền nào rời két.',
  },
} as const satisfies Record<string, ReasonEntry>;

export type ReasonCode = keyof typeof REASONS;
export const ReasonCode = z.enum(Object.keys(REASONS) as [ReasonCode, ...ReasonCode[]]);

export const isReasonCode = (v: unknown): v is ReasonCode =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(REASONS, v);

/** Normalise anything (decoded error name, sim revert string, null) to a known code. */
export const toReasonCode = (v: unknown): ReasonCode => (isReasonCode(v) ? v : 'UNKNOWN_REVERT');

const PLACEHOLDER = /\{(\w+)\}/g;

/** Placeholder names used by a template, in order of appearance. */
export const reasonPlaceholders = (template: string): string[] =>
  [...template.matchAll(PLACEHOLDER)].map((m) => m[1] as string);

/**
 * Vietnamese sentence for a reason code. Never throws: an unknown code falls back to
 * UNKNOWN_REVERT, and a missing value falls back to the number-free sentence.
 */
export function formatReasonVi(code: unknown, params: ReasonParams = {}): string {
  const entry: ReasonEntry = REASONS[toReasonCode(code)];
  const values = params as Record<string, string | undefined>;
  const missing = reasonPlaceholders(entry.messageVi).some((name) => !values[name]);
  if (missing) return entry.fallbackVi ?? entry.messageVi;
  return entry.messageVi.replace(PLACEHOLDER, (_, name: string) => values[name] as string);
}

/**
 * Display a base-unit amount the Vietnamese way: formatAmountVi(2_000_000_000n, 6, 'USDC')
 * -> "2.000 USDC", formatAmountVi(1_500_000n, 6) -> "1,5". Exact bigint math; the fraction
 * is truncated (never rounded up) to `maxFraction` digits. Display only, never parse it back.
 */
export function formatAmountVi(
  value: bigint,
  decimals: number,
  symbol?: string,
  maxFraction = 2,
): string {
  const [whole = '0', frac = ''] = formatUnits(value, decimals).split('.');
  const neg = whole.startsWith('-');
  const digits = neg ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const shownFrac = frac.slice(0, maxFraction).replace(/0+$/, '');
  const isZero = /^0*$/.test(digits) && !shownFrac;
  const num = `${neg && !isZero ? '-' : ''}${grouped}${shownFrac ? `,${shownFrac}` : ''}`;
  return symbol ? `${num} ${symbol}` : num;
}
