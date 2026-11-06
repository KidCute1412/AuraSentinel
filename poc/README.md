# poc/ — Proof of concept

Thư mục thử nhanh để chứng minh một tính năng rủi ro **làm được** trước khi code thật dựa vào nó.

## Quy tắc

- Nằm ngoài `pnpm-workspace.yaml` và ngoài CI. `apps/*` và `packages/*` không được import từ đây.
- Mỗi POC là một folder `poc/<tên>/` có `README.md` theo [`_template.md`](./_template.md): câu hỏi, tiêu chí pass/fail, timebox (2–4 giờ), kết quả.
- Code POC là đồ bỏ. Kết luận phải ghi vào [`docs/research/poc-results.md`](../docs/research/poc-results.md); nếu đổi thiết kế thì sửa `system-design.md` trước.
- Không đưa private key hay secret thật vào đây (P5).

## Danh sách

Nhóm A là rủi ro chết người, làm trước (tuần 1). Nhóm B là rủi ro vừa. Nhóm C là có thì tốt.

| # | Folder | Câu hỏi cần chốt | Nhóm | Trạng thái |
|---|---|---|---|---|
| 1 | `safe-module-fuji` | Safe canonical có trên Fuji không? `enableModule`, rồi module gọi `execTransactionFromModule` bằng session key có chạy end-to-end không? | A | Chưa làm |
| 2 | `owner-sign-browser` | Owner ký `setPolicy` và Kill-Switch từ browser qua Core/MetaMask có ổn không? Backend tắt thì Kill-Switch còn chạy không? Đo độ trễ. | A | Chưa làm |
| 3 | `dex-on-fuji-fork` | Router/DEX nào có thanh khoản thật trên Fuji? Swap qua module trên Anvil fork có chạy được không, fork có ổn định cho demo không? | A | Chưa làm |
| 4 | `siwe-auth` | wagmi/RainbowKit + Core wallet trên Fuji, server verify chữ ký, kiểm tra `Safe.getOwners`, cấp cookie JWT. Pin wagmi v2 hay v3? | A | Chưa làm |
| 5 | `simulate-before-sign` | `eth_call`/`debug_traceCall` trên fork có tính được balance delta để auditor ra verdict xác định không? | A | Chưa làm |
| 6 | `gemini-explainer` | Gemini 2.5 Flash trả JSON `messageVi` đúng schema không? Độ trễ, rate limit, chống prompt-injection, fallback bằng template khi lỗi. | B | Chưa làm |
| 7 | `price-oracle` | Quy đổi spend limit ra USD thế nào? Chainlink feed trên Fuji có đủ cặp không? Nếu không thì dùng giá cố định hay giá từ pool? | B | Chưa làm |
| 8 | `bullmq-execution` | Worker retry không double-spend, nonce session key không đua nhau, job idempotent. | B | Chưa làm |
| 9 | `event-indexing` | RPC public Fuji có rate limit không? Polling hay websocket? Reorg và mất event xử lý ra sao? | B | Chưa làm |
| 10 | `redteam-tokens` | Token fee-on-transfer, honeypot, approve vô hạn, target lạ: module có chặn đủ không? | B | Chưa làm |
| 11 | `demo-reset` | Snapshot/reset Anvil trong vài giây, `seed --verify`, chạy demo khi mạng ngoài chập chờn. | B | Chưa làm |
| 12 | `gate-real-device` | Aura-kun và bánh xe cổng trên điện thoại cảm ứng thật (kéo, hiệu năng rAF). | C | Chưa làm |

Thứ tự đề xuất: 1 → 3 → 2 → 4 → 5. Nếu #1–#3 fail thì phải đổi kiến trúc ngay.
