# poc/ — Proof of concept

Thư mục thử nhanh để chứng minh một tính năng rủi ro **làm được** trước khi code thật dựa vào nó.

## Quy tắc

- Nằm ngoài `pnpm-workspace.yaml` và ngoài CI. `apps/*` và `packages/*` không được import từ đây.
- Mỗi POC là một folder `poc/<tên>/` có `README.md` theo [`_template.md`](./_template.md): câu hỏi, tiêu chí pass/fail, timebox (2–4 giờ), kết quả.
- Code POC là đồ bỏ. Kết luận phải ghi vào [`docs/research/poc-results.md`](../docs/research/poc-results.md); nếu đổi thiết kế thì sửa `system-design.md` trước.
- Không đưa private key hay secret thật vào đây (P5).

## Danh sách

Nhóm A là rủi ro chết người, làm trước (tuần 1). Nhóm B là rủi ro vừa, timebox ngắn. Nhóm C là có thì tốt.

| # | Folder | Câu hỏi cần chốt | Nhóm | Trạng thái |
|---|---|---|---|---|
| 1 | `safe-module-fuji` | Safe v1.4.1 có trên Fuji không (singleton/factory)? Deploy bằng Protocol Kit, `enableModule`, rồi module gọi `execTransactionFromModule` bằng session key có chạy end-to-end không? Gồm: fund gas cho agent EOA, giới hạn faucet, RPC key. | A | Chưa làm |
| 2 | `owner-sign-browser` | Owner ký `setPolicy` và Kill-Switch từ browser qua Core/MetaMask có ổn không? Backend tắt thì Kill-Switch còn chạy không? Đo độ trễ. Gồm: SIWE + `Safe.getOwners` + cookie JWT, chốt wagmi v2 hay v3. | A | Chưa làm |
| 3 | `dex-on-fuji-fork` | Router/DEX nào có thanh khoản thật trên Fuji? Tạo pool MockUSDC/WAVAX, `addLiquidity`, swap qua module trên Anvil fork có chạy không? Gồm script poll `getLogs` trên RPC public (rate limit). | A | Chưa làm |
| 13 | `onchain-revert-proof` | Tx `executeGuardedSwap(2000e6)` với `gas` thủ công có được mined và revert on-chain với `ExceedsPerTxCap` trên Fuji (Snowtrace) không? Session key gọi `safe.execTransactionFromModule(approve)` có revert `GS104` on-chain, decode được lỗi không? | A | Chưa làm |
| 5 | `simulate-before-sign` | Trên Anvil fork: `anvil_reset` mất bao lâu (ngưỡng 500ms)? Thực thi tx rồi đọc balance delta có đủ để auditor ra verdict xác định không? Cùng swap trên fork và Fuji thật cho kết quả giống nhau không (router, `block.timestamp`/`dayId`)? | A | Chưa làm |
| 6 | `gemini-explainer` | (1h) Key chạy được từ mạng VN? Gemini 2.5 Flash trả JSON `messageVi` đúng schema, độ trễ <2s? Fallback template khi lỗi. | B | Chưa làm |
| 12 | `gate-real-device` | Aura-kun và bánh xe cổng trên điện thoại cảm ứng thật (kéo, hiệu năng rAF). | C | Chưa làm |

## Đã bỏ / gộp (không làm POC riêng)

| Cũ | Xử lý | Lý do |
|---|---|---|
| 4 `siwe-auth` | Gộp vào #2 | Pattern chuẩn, rủi ro thấp. |
| 7 `price-oracle` | Quyết định thiết kế | Cap theo token (C1) + `getAmountsOut`; Chainlink là stretch, check feed 15 phút nếu còn thời gian. |
| 8 `bullmq-execution` | Integration test khi code thật | `concurrency=1` + viem `nonceManager` đã đủ cho P4. |
| 9 `event-indexing` | Gộp vào #3 | Một script poll `getLogs`. |
| 10 `redteam-tokens` | Foundry fuzz/invariant test | Fee-on-transfer/honeypot ngoài phạm vi demo; thay bằng #13. |
| 11 `demo-reset` | Việc tuần 3 (`seed --verify`) | Là engineering, không phải rủi ro khả thi. |

Thứ tự: 1 → 3 → 13 → 2 → 5. Nếu #1, #3 hoặc #13 fail thì phải đổi kiến trúc ngay.
