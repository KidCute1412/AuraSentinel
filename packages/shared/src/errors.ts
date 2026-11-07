import { z } from 'zod';

/** HTTP error codes from api.md. Revert reason codes + Vietnamese copy are AIE-owned and added later. */
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
