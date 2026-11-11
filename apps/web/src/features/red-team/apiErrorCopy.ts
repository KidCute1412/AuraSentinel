import { ApiError } from "@/shared/api";

export interface ErrorCopy {
  message: string;
  /** Seconds to wait before the buttons come back (429), when the server says so. */
  retryAfterSec: number | null;
}

/**
 * English copy for a failed button press (api.md #10, #12 errors). The server's problem
 * `detail` is kept for 400s, where it says which field is wrong.
 */
export function describeApiError(err: unknown): ErrorCopy {
  if (!(err instanceof ApiError)) return { message: "Something unexpected went wrong. Try again later.", retryAfterSec: null };
  const wait = err.retryAfterSec;
  switch (err.code) {
    case "COOLDOWN":
    case "RATE_LIMITED":
      // With Retry-After the panel shows a live countdown next to this message.
      return {
        message: wait ? "Cooling down to prevent spam." : "Cooling down to prevent spam. Try again in a few minutes.",
        retryAfterSec: wait,
      };
    case "QUEUE_BUSY":
      return { message: "Another order is running. Wait for it to finish, then press again.", retryAfterSec: wait };
    case "AGENT_LOW_GAS":
      return { message: "The agent is almost out of AVAX for gas. An admin must top it up before you try again.", retryAfterSec: null };
    case "VALIDATION_ERROR":
      return { message: `Invalid request: ${err.message}`, retryAfterSec: null };
    case "UNAUTHENTICATED":
    case "NOT_OWNER":
      return { message: "Only the vault owner can run orders on this vault.", retryAfterSec: null };
    case "VAULT_NOT_FOUND":
      return { message: "The server does not know this vault.", retryAfterSec: null };
    case "CHAIN_UNAVAILABLE":
      return { message: "Cannot read the blockchain right now. Try again in a few minutes.", retryAfterSec: wait };
    default:
      // NETWORK_ERROR, BAD_RESPONSE, HTTP_ERROR and the rest already carry English text (shared/api/client.ts).
      return { message: err.message, retryAfterSec: wait };
  }
}
