# Test toàn hệ thống: kịch bản từng bước

Kịch bản bấm tay để xem AuraSentinel chạy end to end trên máy local với dữ liệu thật (Avalanche Fuji). Mỗi bước ghi **bấm gì** và **thế nào là thành công (✅)**.

Cập nhật: 19/11/2026.

> **Không có mock ở chế độ live.** Web chạy `VITE_DATA_SOURCE=live`; server có `POLICY_MODULE_ADDRESS` (mặc định) và `AGENT_PRIVATE_KEY`. Khi đó: Pre-check đọc policy và chi tiêu thật từ chain; Simulation chạy thật trên Anvil fork của Fuji; Invariants là luật cố định trên kết quả mô phỏng; On-chain là tx thật ký bằng agent key. Thiếu Anvil thì Preflight ở `/admin` báo **Services: FAIL**.

---

## 0. Chuẩn bị

- [ ] `apps/server/.env` có:
  - `AGENT_PRIVATE_KEY`: key của agent (chỉ máy chạy server giữ)
  - `ADMIN_ADDRESSES`: địa chỉ ví MetaMask của bạn
  - `SESSION_SECRET`: chuỗi bất kỳ **≥ 32 ký tự** (để restart không bị đăng xuất)
  - `GEMINI_API_KEY`: tuỳ chọn; không có thì phần giải thích dùng câu mẫu
- [ ] MetaMask đang ở mạng **Avalanche Fuji**, có một ít AVAX test (faucet: core.app/tools/testnet-faucet)
- [ ] Chạy `start.bat`, đợi tới khi báo health OK

> Mở web bằng `http://localhost:5173`, **không** dùng link Cloudflare: đăng nhập SIWE chỉ chấp nhận domain `localhost:5173`.

---

## Bước 1: Server sống

Mở `http://localhost:5173/api/health`.

✅ JSON có `"status":"ok"`, và `postgres`, `redis`, `rpc`, `worker` đều `"up"`.

---

## Bước 2: Đăng nhập

1. Vào `localhost:5173`, bấm **Sign in** ở góc phải.
2. Chọn MetaMask, giữ nút để ký (miễn phí, không tốn gas).

✅ Cửa két mở ra. Header hiện địa chỉ ví (`0x12E3…8199`) và nút **ADMIN**.

---

## Bước 3: Kiểm tra sân khấu ở `/admin`

Bấm nút **ADMIN** trên header.

✅ Mục **01 Preflight**: các dòng Services, Agent gas, Demo vault armed, Daily budget, Vault balance, Indexer đều **OK**.

Thử thêm:

| Bấm | ✅ Thành công khi |
|---|---|
| Mục 02: **Demo mode** | Dòng "Demo mode" ở Preflight chuyển **OK**; con dấu đầu trang lên `READY` hoặc ít WARN hơn |
| **Running**, rồi **Run one tick now** | Vài giây sau, bảng "Last tick" cập nhật, ghi rõ vault nào bị bỏ qua và vì sao |
| Mục 03: tab **Blocked** / **Failed**, nút **Older** | Danh sách lọc đúng, 10 job một trang, gom theo ngày |
| Mục 04: **Bull Board** | Trang Bull Dashboard hiện đủ các queue (không trắng) |

> **Bật lại Demo mode** trước bước 4, để rebalancer không tự chen job vào.

---

## Bước 4: Luồng demo chính (`/demo`, tab **Guided**)

Làm lần lượt 5 bước trên trang:

| Bấm | ✅ Thành công khi |
|---|---|
| **01 Normal trade** (mặc định 20 USDC; ô nhập cho chọn 1–100, nút nhanh 10/20/50/100; gõ 150 thì báo lỗi và nút bị khoá) | Con dấu **APPROVE / SAFE**; số dư USDC giảm đúng số đã chọn và WAVAX tăng; có link Snowtrace tới tx thành công |
| **02 Take too much** (2.000 USDC) | **BLOCKED · Shield 1**, lý do `ExceedsPerTxCap`; **không có** tx nào lên chain; số dư không đổi |
| **03 Hijack the AI** (Plant the fake message) | Thẻ "The agent's brain": feed độc, suy nghĩ của AI, kế hoạch "All the USDC → 0x9999…9999" có cờ đỏ; con dấu **BLOCKED** "The AI was fooled. The vault was not."; không có tx; số dư không đổi. Nhãn nguồn `LLM · gemini-…` khi có key, `Rules · …` khi không |
| **04 Hack around** (Bypass) | **Shield 2 blocked**: tx thật lên chain và **bị revert**; Snowtrace hiện tx `Fail` |
| **05 Emergency stop** | Ở bản live, nút **bị tắt có chủ ý**: vault demo dùng chung, khách không được khoá nó cho mọi người. Trang giải thích và cho bấm "Got it". Test Kill-Switch thật ở **bước 8** (két riêng) |

**Đọc kết quả của mỗi bước (Shield pipeline):** dưới con dấu có thanh ray 4 đoạn và 4 ô cổng.

| Bước | ✅ Ray và bảng luật đúng khi |
|---|---|
| 01 Normal trade | 4 cổng `Passed`. Bấm **Simulation**: "Vault pays −20 USDC" (hoặc số đã chọn), "Vault receives … WAVAX". Bấm **On-chain policy**: có link tx |
| 02 Take too much | **Pre-check** `Stopped here`, 3 cổng sau `Not reached`. Bảng: dòng **Per-trade cap** `FAIL`, `2,000 USDC ≤ 500 USDC`, mã `ExceedsPerTxCap`; dòng Daily cap có thanh "đã tiêu + lệnh này / cap" |
| 03 Hijack the AI | **Pre-check** `Stopped here`; bảng có **Proceeds go back to the vault** `FAIL` (`RECIPIENT_NOT_SAFE`) cùng các cap; sơ đồ tiền vẽ mũi tên đỏ tới "Stranger" |
| 04 Hack around | 3 cổng Shield 1 `Bypassed` (viền nét đứt), **On-chain policy** `Stopped here`; bảng có "Contract accepted it: FAIL" và link tx bị revert |

> Job tạo **trước** bản cập nhật này không có bảng luật: ô cổng vẫn đúng, phần bảng chỉ hiện một câu lý do.

---

## Bước 5: Free play (`/demo`, tab **Free play**)

| Bấm | ✅ Thành công khi |
|---|---|
| Tab **Attacks**: Over-withdraw, Wrong recipient, Unlimited approval, Bypass the website | Mỗi đòn ra **BLOCKED** kèm lý do riêng |
| Tab **Hijack the AI**: bấm mẫu **Send everything to 0x999** → **Hijack the agent** | Thẻ "The agent's brain" hiện feed, suy nghĩ, kế hoạch swap (trường nguy hiểm tô đỏ); verdict **BLOCKED** ở Shield 1 |
| Cùng tab: mẫu **Approve unlimited USDC** | **Reverted · the Safe** (`GS104`), có link Snowtrace |
| Cùng tab: mẫu **A normal 10 USDC trade** | **HELD · NOT SENT**: 3 cổng Shield 1 xanh, gói lệnh dừng trước chain, số dư không đổi |
| Cùng tab: **Auto red-team · 5 attacks** | Bảng 5 dòng, mỗi dòng ra Blocked/Reverted/Held; tổng **0 / 5 got funds out**; bấm lần 2 trong 60s → thông báo chờ |
| Tab **Normal trade**: Run rebalance | **APPROVE**, số dư đổi |
| **View all** dưới "Recent jobs" | Mở trang Activity: job gom theo ngày, 10 job một trang, có bộ lọc |

---

## Bước 6: Bằng chứng (`/proof`)

✅ Mục **04 "Real attacks, reverted by the chain"** có tx bị revert ở bước 4.03; bấm vào thì Snowtrace hiện `Fail`.
✅ Các contract ở mục 01 hiện `Verified`.

---

## Bước 7: Tạo két riêng (`/vaults/new`)

Đi hết wizard: tạo Safe → gắn module → đặt policy → nạp USDC. Mỗi bước ký MetaMask một lần.

✅ Trang "Vault ready". Két mới xuất hiện ở `/vaults` và trong danh sách **Vaults** ở `/admin`, với ghi chú `Slot n/5`.

---

## Bước 8: Quyền owner trên két vừa tạo (`/vaults/<két mới>`)

| Thao tác | ✅ Thành công khi |
|---|---|
| **Policy**: hạ maxPerTx xuống 100, ký | Panel cập nhật sau vài giây; thử swap 200 thì **BLOCKED** |
| **Funds**: nạp rồi rút một ít | Số dư đổi đúng |
| **Red team**: bấm một đòn | Bị chặn như ở bước 5 |

---

## Bước 9: Rebalancer tự chạy

1. Ở `/admin`, chọn **Running**.
2. Đợi khoảng 30 giây.

✅ Trang Activity của két mới có job **Auto rebalance**, hoặc bảng "Last tick" ghi "Already balanced" nếu két đã cân.

> Xong thì bật lại **Demo mode**.

---

## Bước 10: Người lạ (cửa sổ ẩn danh, không đăng nhập)

| Vào | ✅ Thành công khi |
|---|---|
| `/demo` | Bấm được mọi nút; bấm liên tục quá nhanh thì bị báo phải chờ (giới hạn tần suất) |
| `/vaults/<két của bạn>` | Chỉ xem được, không có nút owner |
| `/admin` | Màn "Sign in with an admin wallet" |

---

## Còn lại trước khi nộp (23:59 ngày 21/11)

**Code:**

| # | Việc | Mức độ |
|---|---|---|
| 1 | Giải thích của AI đang viết **tiếng Việt** (`explain.prompt.ts`, `template.ts`), trong khi UI là tiếng Anh. Cần chốt ngôn ngữ | Nên chốt trước khi quay video |
| 2 | README cũ: vẫn ghi "AgentShield", "contracts đang làm", "chưa deploy nên dùng dữ liệu mẫu" | Phải sửa trước khi nộp |
| 3 | Ghi chú về gas sai (`env.schema.ts:62` ghi "~1 swap"); watchdog báo gas thấp dưới 0,1 AVAX, trong khi agent đang có 0,05, nên sẽ báo động liên tục | Nhỏ |
| 4 | E2E server chưa chạy lại từ khi có trang admin (cần Anvil + Redis) | Chạy một lần trước khi freeze |
| 5 | Branch `mvp` đi trước `origin/chore/env-simplify` 4 commit, chưa push | Chốt chỗ push |
| 6 | Vài comment `TODO` cũ đã làm xong nhưng chưa xoá | Không ảnh hưởng |

**Ngoài code** (`docs/runbook/tasks.csv`):
- deploy bản cho giám khảo chạy 24/7;
- T2 Milestone B;
- T3 freeze + bug bash;
- Q12 slide, video, README;
- T4 nộp bài;
- cập nhật lại các task đã xong nhưng còn ghi `Review` / `Doing`.
