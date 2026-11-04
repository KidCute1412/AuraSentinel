# 🎬 Demo Runbook (3 phút)

> Nguyên tắc: **demo không được fail**. Checklist kỹ thuật chi tiết: skill `demo-readiness`. Nguồn thiết kế: [`system-design.md` §5, §9](../architecture/system-design.md).

## 1. Trước giờ thi (T-60 → T-10 phút)

- [ ] `docker compose up` sạch, `pnpm seed --verify` toàn `PASS`
- [ ] **Demo mode bật:** rebalancer scheduler đã `pause` (`POST /admin/rebalancer/pause`); chỉ bấm tay
- [ ] Safe có đủ MockUSDC; agent EOA có AVAX trả gas
- [ ] Policy đang `isActive`, `spentToday = 0` (lưu ý `dayId` theo UTC: 00:00 UTC = 7h sáng VN)
- [ ] Gemini key còn quota; thử 1 lần ra badge `llm`
- [ ] Thử ngắt Wi-Fi: giải thích chuyển sang `template` < 2s, UI không vỡ
- [ ] Mở sẵn tab Snowtrace Fuji; ví owner đã kết nối và đủ gas
- [ ] Có RPC dự phòng; laptop dự phòng hoặc bản cloud
- [ ] Sau rehearsal cuối: **reset trạng thái** (policy mới, hoặc đợi sang `dayId` mới) để thanh budget bắt đầu từ 0

## 2. Kịch bản

| Phút | Thao tác | Kết quả trên màn hình | Điều cần nói |
|---|---|---|---|
| **1** · Chạy chuẩn | Bấm **Run Rebalance (200 USDC)** | Timeline precheck → sim → invariant → chain; thẻ xanh *"An toàn, tiêu 13,3% hạn mức ngày"* (badge `llm`); budget 200 / 1,500; Before→After đổi | AI chỉ giải thích; số tiền do toán quyết định; tiền về lại Safe |
| **2** · Tấn công | Bấm đỏ **#1 Over-withdraw 2,000** | Thẻ đỏ, reason code `ExceedsPerTxCap`, giải thích tiếng Việt; không có tx on-chain | Shield 1 chặn ngoài cửa |
| | Bấm đỏ **#4 Bypass website ⚡** | Thẻ đỏ + **link Snowtrace của tx revert** `ExceedsPerTxCap`; số dư Safe không đổi | Bỏ qua cả web của chúng tôi, chain vẫn chặn: đây là Shield 2 |
| **3** · Kill | Bấm **KILL-SWITCH** (ví owner ký) | `PolicyRevoked`, hiển thị độ trễ ~1.5s, trạng thái chuyển 🔴 | Ký từ browser, không qua backend: "tắt server đi, nút Kill vẫn chạy" |
| | (tuỳ chọn) bấm lại Rebalance | Bị chặn `PolicyInactive` | Session key đã vô hiệu |
| | Chiếu kết quả `forge test --fuzz-runs 10000` | 10,000 runs xanh, invariant xanh | Kỹ thuật: fuzz + invariant testing |

Nếu còn thời gian: #2 Wrong recipient, #3 Unlimited approval (Safe revert `GS104`), ô prompt-injection (badge "LLM bị bỏ qua — template" nếu output sai số).

## 3. Câu thoại Avalanche (điểm tích hợp 25%)

- Finality ~1–2s ⇒ Kill-Switch có hiệu lực trước khi kẻ tấn công kịp rút; chain chậm hơn mất 15–30s.
- Snowman consensus: không cần chờ N confirmation hay xử lý reorg ⇒ indexer đơn giản.
- Chạy thật trên Fuji; có link Snowtrace cho mọi tx.

## 4. Nếu có sự cố trên sân khấu

| Sự cố | Cách xử lý |
|---|---|
| Gemini chậm | Để nguyên: badge `template` là tính năng, nói luôn |
| RPC chậm | Fallback transport tự chuyển; nếu treo, mở tx trên Snowtrace bằng link đã chuẩn bị |
| Job `failed` (hạ tầng) | Bấm lại; không retry revert: revert là kết quả đúng |
| Hết budget ngày | Dùng policy mới / lùi sang bản backup đã seed |
| Toàn bộ backend sập | Chuyển sang demo Kill-Switch trực tiếp từ browser (không phụ thuộc backend) |
