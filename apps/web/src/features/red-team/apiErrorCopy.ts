import { ApiError } from "@/shared/api";

export interface ErrorCopy {
  message: string;
  /** Seconds to wait before the buttons come back (429), when the server says so. */
  retryAfterSec: number | null;
}

/**
 * Vietnamese copy for a failed button press (api.md #10, #12 errors). The server's problem
 * `detail` is kept for 400s, where it says which field is wrong.
 */
export function describeApiError(err: unknown): ErrorCopy {
  if (!(err instanceof ApiError)) return { message: "Có lỗi không mong đợi. Thử lại sau.", retryAfterSec: null };
  const wait = err.retryAfterSec;
  switch (err.code) {
    case "COOLDOWN":
    case "RATE_LIMITED":
      // With Retry-After the panel shows a live countdown next to this message.
      return {
        message: wait ? "Đang trong thời gian chờ để chống spam." : "Đang trong thời gian chờ để chống spam. Thử lại sau ít phút.",
        retryAfterSec: wait,
      };
    case "QUEUE_BUSY":
      return { message: "Đang có một lệnh khác chạy. Đợi lệnh đó xong rồi bấm lại.", retryAfterSec: wait };
    case "AGENT_LOW_GAS":
      return { message: "Agent sắp hết AVAX để trả phí gas. Admin cần nạp thêm trước khi thử tiếp.", retryAfterSec: null };
    case "VALIDATION_ERROR":
      return { message: `Yêu cầu không hợp lệ: ${err.message}`, retryAfterSec: null };
    case "UNAUTHENTICATED":
    case "NOT_OWNER":
      return { message: "Chỉ chủ vault mới chạy được lệnh trên vault này.", retryAfterSec: null };
    case "VAULT_NOT_FOUND":
      return { message: "Máy chủ không biết vault này.", retryAfterSec: null };
    case "CHAIN_UNAVAILABLE":
      return { message: "Không đọc được blockchain lúc này. Thử lại sau ít phút.", retryAfterSec: wait };
    default:
      // NETWORK_ERROR, BAD_RESPONSE, HTTP_ERROR and the rest already carry Vietnamese text (shared/api/client.ts).
      return { message: err.message, retryAfterSec: wait };
  }
}
