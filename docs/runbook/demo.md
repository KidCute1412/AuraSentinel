# 🎬 Demo Runbook (3 phút)

> Nguyên tắc: **demo không được fail**. Checklist kỹ thuật chi tiết: skill `demo-readiness`. Nguồn thiết kế: [`system-design.md` §5, §9](../architecture/system-design.md).

## 1. Trước giờ thi (T-60 → T-10 phút)

- [ ] `docker compose up` sạch, `pnpm seed --verify --api http://localhost:8080 --web http://localhost:8080 --env infra/.env.prod` ra `0 FAIL` (WARN đọc kỹ: gas agent, ngân sách ngày, hạn policy). Báo cáo đầy đủ: [`security-report.md`](./security-report.md)
- [ ] **Preflight `READY`:** đăng nhập bằng ví trong `ADMIN_ADDRESSES` → nút **Admin** trên header → trang `/admin`. Mục 01 phải toàn `OK`; dòng nào `WARN`/`FAIL` thì làm theo dòng `Fix` của nó
- [ ] **Demo mode bật:** ở mục 02 của `/admin` chọn `Demo mode` (hoặc `PATCH /api/v1/admin/rebalancer {"paused":true}`); rebalancer không tự swap nữa, chỉ bấm tay
- [ ] Safe có đủ MockUSDC; agent EOA có AVAX trả gas
- [ ] Policy đang `isActive`, `spentToday = 0` (lưu ý `dayId` theo UTC: 00:00 UTC = 7h sáng VN)
- [ ] Gemini key còn quota (free tier ~10 RPM, ~250 lượt/ngày); thử 1 lần ra badge `llm`, và 1 lượt **Hijack the AI** ra nhãn `LLM · gemini-2.5-flash` trên thẻ "The agent's brain" (nếu ra `Rules · …` là LLM chưa chạy)
- [ ] Thử ngắt Wi-Fi: giải thích chuyển sang `template` < 2s, UI không vỡ
- [ ] Mở sẵn tab Snowtrace Fuji; ví owner đã kết nối và đủ gas
- [ ] Có RPC dự phòng; laptop dự phòng hoặc bản cloud
- [ ] Sau rehearsal cuối: **reset trạng thái** (policy mới, hoặc đợi sang `dayId` mới) để thanh budget bắt đầu từ 0

## 2. Kịch bản

| Phút | Thao tác | Kết quả trên màn hình | Điều cần nói |
|---|---|---|---|
| **1** · Chạy chuẩn | Guided bước 01: chọn số USDC (mặc định 20, tối đa 100 trên vault demo dùng chung) rồi bấm **Make the trade** | Track đi qua 4 cổng; thẻ xanh SAFE (badge `llm`); budget tăng đúng số đã chọn; Before→After đổi | AI chỉ giải thích; số tiền do toán quyết định; tiền về lại Safe |
| **2** · Tấn công | Bấm đỏ **#1 Over-withdraw 2,000** | Thẻ đỏ, reason code `ExceedsPerTxCap`, giải thích tiếng Việt; không có tx on-chain | Shield 1 chặn ngoài cửa |
| | Guided bước 03 **Hijack the AI**: bấm **Plant the fake message** | Thẻ "The agent's brain": tin độc trong feed, suy nghĩ của AI, kế hoạch "swap all the USDC → 0x9999…" tô đỏ; rồi Shield 1 chặn (`RECIPIENT_NOT_SAFE`, vượt cap) | "Chính con AI bị lừa và thật sự cố rút tiền. Vault vẫn an toàn, vì luật nằm ngoài AI." |
| | Bấm đỏ **#4 Bypass website ⚡** | Thẻ đỏ + **link Snowtrace của tx revert** `ExceedsPerTxCap`; số dư Safe không đổi | Bỏ qua cả web của chúng tôi, chain vẫn chặn: đây là Shield 2 |
| **3** · Kill | Bấm **KILL-SWITCH** (ví owner ký) | `PolicyRevoked`, hiển thị độ trễ ~1.5s, trạng thái chuyển 🔴 | Ký từ browser, không qua backend: "tắt server đi, nút Kill vẫn chạy" |
| | (tuỳ chọn) bấm lại Rebalance | Bị chặn `PolicyInactive` | Session key đã vô hiệu |
| | Chiếu kết quả `forge test --fuzz-runs 10000` | 10,000 runs xanh, invariant xanh | Kỹ thuật: fuzz + invariant testing |

Nếu còn thời gian: #2 Wrong recipient, #3 Unlimited approval (Safe revert `GS104`), Free play tab **Hijack the AI** → **Auto red-team · 5 attacks** (AI tấn công tự viết 5 đòn, bảng điểm "0 / 5 got funds out"; cooldown 60s mỗi vault, tốn khoảng 6 lượt gọi LLM).

## 3. Câu thoại Avalanche (điểm tích hợp 25%)

- Finality ~1–2s ⇒ Kill-Switch có hiệu lực trước khi kẻ tấn công kịp rút; chain chậm hơn mất 15–30s.
- Snowman consensus: không cần chờ N confirmation hay xử lý reorg ⇒ indexer đơn giản.
- Chạy thật trên Fuji; có link Snowtrace cho mọi tx.

## 4. Nếu có sự cố trên sân khấu

| Sự cố | Cách xử lý |
|---|---|
| Gemini chậm | Để nguyên: badge `template` là tính năng, nói luôn |
| Hijack ra `Rules · LLM busy/too slow` | Vẫn đúng: rule planner đóng vai AI bị lừa, các shield chặn y như vậy. Nói: "kể cả khi LLM sập, demo vẫn chạy" |
| RPC chậm | Fallback transport tự chuyển; nếu treo, mở tx trên Snowtrace bằng link đã chuẩn bị |
| Job `failed` (hạ tầng) | Bấm lại; không retry revert: revert là kết quả đúng |
| Hết budget ngày | Dùng policy mới / lùi sang bản backup đã seed |
| Toàn bộ backend sập | Chuyển sang demo Kill-Switch trực tiếp từ browser (không phụ thuộc backend) |
