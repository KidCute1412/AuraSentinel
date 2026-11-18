# 🖥️ AgentShield — Thiết kế các trang UI

> Bản **multi-vault** theo `plan.md` D11, D12, D15, D16. Thay cho mô tả "1 màn 3 cột" trong `codebase.md` §5 (3 cột nay là layout của `/demo` và `/vaults/:safe`). API chi tiết: [`../architecture/api.md`](../architecture/api.md). Nếu lệch, `system-design.md` thắng.
>
> **Giao diện (màu, chữ, bóng, component) bắt buộc theo [`design-system.md`](./design-system.md).** File này chỉ mô tả trang và hành vi.
>
> **Ngôn ngữ UI: 100% tiếng Anh.** Các chuỗi tiếng Việt được trích trong file này (ví dụ "Hoàn tất bước 1 trước", "Đang nối lại") chỉ mô tả ý; chuỗi hiển thị thật trong code là tiếng Anh (ví dụ `Finish the "Safe" step before "Module"`). Số định dạng en-US (`1,500.5`, `13.3%`).
>
> Bất biến: Kill-Switch và `setPolicy` ký bằng ví owner **ngay trong browser** (P2); tiền luôn là string base units, format chỉ ở UI (P5); LLM chỉ viết `messageVi` (P3).

---

## 1. Sơ đồ trang

| Route | Trang | Quyền | Owner task | API chính | Ví ký |
|---|---|---|---|---|---|
| `/` | Landing + How it works | public | Q11 | `GET /proof` (số liệu nhỏ, tuỳ chọn) | không |
| `/signin` (`/signup` chuyển về đây) | Cổng truy cập: đăng nhập/đăng ký bằng ví (SIWE), không có email/mật khẩu | public | A9 (nối thật) | `/auth/*` (chưa nối, đang giả lập) | ký thông điệp SIWE (không gas) |
| `/demo` | Demo vault (sandbox), **một màn** | public, **không cần đăng nhập** (throttle IP, D12) | Q9, Q10, Q11 | state, jobs, rebalance, attacks, SSE | owner demo: setPolicy/Kill |
| `/vaults` | Danh sách vault của tôi (§11) | ví kết nối | L9 | `GET /vaults` | không |
| `/vaults/new` | Chuyển sang bước đầu tiên chưa xong của wizard | ví kết nối | L9 | — | — |
| `/vaults/new/safe` | Wizard bước 1: chọn/tạo Safe | ví kết nối | L9 | — (đọc chain) | create Safe |
| `/vaults/new/module` | Wizard bước 2: triển khai + bật module | ví kết nối | L9 | — (đọc chain) | deployModule, enableModule |
| `/vaults/new/policy` | Wizard bước 3: đặt policy | ví kết nối | L9 | — | setPolicy |
| `/vaults/new/fund` | Wizard bước 4: nạp tiền | ví kết nối | L9 | — | faucet, deposit |
| `/vaults/:safe` | **Tổng quan** vault (dashboard 3 cột, §4) | public đọc; owner thao tác | L7, L8, Q9 | như `/demo` + auth | setPolicy, revoke, deposit, withdraw |
| `/vaults/:safe/activity` | Lịch sử job, có lọc (§10.1) | public đọc | Q9 | `GET /vaults/{safe}/jobs` | không |
| `/vaults/:safe/activity/:jobId` | Chi tiết một job, link chia sẻ được (§10.2) | public đọc | Q9 | `GET /jobs/{id}` | không |
| `/vaults/:safe/policy` | Policy hiện tại, form sửa, lịch sử thay đổi (§10.3) | public đọc; owner sửa | L7 | state, sự kiện chain | setPolicy |
| `/vaults/:safe/funds` | Số dư, nạp, rút, lịch sử chuyển (§10.4) | public đọc; owner thao tác | L8 | state | deposit, withdraw |
| `/vaults/:safe/red-team` | Run Rebalance, 4 đòn tấn công, ô injection (§10.5) | theo §4.3 | Q10 | `POST .../jobs`, `POST .../attacks` | không |
| `/vaults/:safe/settings` | Agent + vùng nguy hiểm (Kill, kích hoạt lại) (§10.6) | chỉ owner | L7 | state | revoke, setPolicy |
| `/proof` | Bằng chứng on-chain | public | L9 | `GET /proof` | không |

Không có route `/admin` (D16): admin là **drawer** trong dashboard, chỉ hiện với role `admin` (§7).

`/demo` thực chất là `/vaults/:demoSafe` với: khách vãng lai thao tác được, rebalancer tắt (D15), guided tour bật, rate limit chặt. Vẫn là **một màn duy nhất** (không có route con), dùng **chung component `VaultDashboard`** với Tổng quan của `/vaults/:safe`, khác nhau ở prop `mode: "demo" | "owner"`.

**Hai vault demo (D15):** vault *công khai* (`/demo`, maxPerTx 500, dailyCap 1.500, cooldown để khó cạn) và vault *sân khấu* do nhóm dùng khi diễn trực tiếp, reset ngay trước giờ diễn. Vault sân khấu truy cập bằng `/vaults/:safe` như vault thường.

**Quy ước URL**

- `:safe` là địa chỉ Safe dạng checksum. Địa chỉ viết thường/hoa lẫn lộn được chuẩn hoá và chuyển hướng về dạng checksum. Địa chỉ sai định dạng hiện trang 404 có câu giải thích ("Địa chỉ vault không hợp lệ").
- `/vault` (số ít) chuyển hướng về `/vaults`.
- Bộ lọc và phân trang nằm trên query string để lưu/chia sẻ được: `/vaults/0x…/activity?status=rejected&page=2`.
- Mọi trang con của vault có breadcrumb: `Vaults › 0x12…ab › Activity`.

```mermaid
flowchart LR
    L["/ Landing"] -->|Thử ngay| D["/demo"]
    L -->|Tạo vault| W["/vaults/new/*"]
    W -->|xong bước 4| V["/vaults/:safe"]
    LIST["/vaults"] --> V
    V --> A["/activity"] --> J["/activity/:jobId"]
    V --> PO["/policy"]
    V --> F["/funds"]
    V --> R["/red-team"]
    V --> S["/settings"]
    D -. link .-> P["/proof"]
    V -. link .-> P
```

### 1.1 Guard (điều hướng theo trạng thái)

**Nguyên tắc:** URL chỉ để điều hướng (Back/Forward, F5, chia sẻ link). **Không** lưu tiến trình trong URL hay DB: tiến trình và quyền được suy ra từ **chain** (P1). Guard ở trình duyệt chỉ phục vụ trải nghiệm, **không phải lớp bảo mật**; lớp chặn thật là contract và chữ ký ví.

Wizard `/vaults/new/*`, bước hoàn thành đọc từ chain:

| Bước | Đã xong khi | Guard khi vào bước này mà bước trước chưa xong |
|---|---|---|
| `safe` | ví nằm trong `Safe.getOwners()` của Safe đã chọn | (bước đầu, không có guard bước trước) |
| `module` | `Safe.isModuleEnabled(factory.moduleOf(safe))` | về `safe` kèm thông báo "Hoàn tất bước 1 trước" |
| `policy` | `policy().isActive`, có `agentSigner`, chưa hết hạn | về bước đầu tiên chưa xong |
| `fund` | balance Safe > 0 | về bước đầu tiên chưa xong |

- Vào bước đã xong: xem được ở chế độ chỉ đọc, kèm nút "Sang bước tiếp theo".
- Chưa kết nối ví: chuyển về `/signin`, quay lại đúng URL sau khi đăng nhập.
- Đang đọc chain: hiện skeleton, **không** chuyển hướng sớm (tránh nhảy trang).
- Đổi ví giữa chừng: tính lại bước theo ví mới, không giữ kết quả cũ.
- Safe đang làm dở được nhớ ở `localStorage` (chỉ để biết đọc chain của Safe nào, không phải nguồn sự thật).

`/vaults/:safe/*`:

| Tình huống | Hành vi |
|---|---|
| Ví không phải owner | Ẩn nút ghi và `settings`; giữ chế độ chỉ đọc, **không** đẩy ra trang khác |
| Vào thẳng `/settings` mà không phải owner | Chuyển về Tổng quan kèm thông báo "Chỉ owner mới xem được" |
| Vault chưa hoàn tất wizard | Owner: chuyển về bước dang dở. Người khác: hiện "Vault chưa sẵn sàng" |
| Vault chưa được indexer đăng ký | Banner "Đang đăng ký…", poll theo §5 |

### 1.1b Vault demo: dùng chung rồi nâng lên bể vault

**Quyết định (2026-11-17, L7):** trên `/demo`, Kill-Switch và đổi Policy **chỉ owner thật của module bấm được** (ký bằng ví trong browser, P2). Khách thấy khối Kill-Switch bị tắt kèm dòng giải thích. Server **không** giữ khoá owner của vault demo, kể cả trên testnet. Khi trình diễn, owner dùng ví deployer trên stage vault. Phương án cũ bên dưới **không làm**.

~~`/demo` cho khách bấm cả Kill-Switch và đổi Policy. Điều này cần server giữ khoá owner của vault demo.~~

- **Giai đoạn 1 (làm trước):** một vault demo dùng chung. Sau khi có người Kill hoặc đổi Policy, server tự đặt lại policy chuẩn sau khoảng 30-60 giây; trang hiện "Demo resets in …". Hạn mức nhỏ, cooldown theo IP, giao dịch của vault xếp hàng tuần tự (tránh trùng nonce).
- **Giai đoạn 2 (nếu còn thời gian):** bể vault dựng sẵn bằng `pnpm seed`. `/demo` cấp cho mỗi khách một vault trong bể (cookie, khoảng 15 phút), hết giờ hoặc "Start over" thì khôi phục rồi trả về bể; hết chỗ thì hiện "Demo is busy". Giao diện vẫn là một dashboard.
- Tiến độ hướng dẫn 4 bước chỉ tính hành động trong lượt truy cập hiện tại.

### 1.2 Thứ tự ưu tiên (để kịp buổi demo)

"Demo" ở đây là buổi trình diễn cho ban giám khảo (xem `pitch.md`) và trang `/demo` dùng cho nó.

| Mức | Route | Lý do |
|---|---|---|
| Phải có | `/demo`, `/vaults/new/*`, `/vaults/:safe` (Tổng quan), `/vaults/:safe/activity/:jobId`, `/vaults/:safe/settings` | Đủ luồng: tạo vault → xem → chạy/tấn công → Kill → chia sẻ link giải thích một job |
| Nên có | `/vaults`, `/vaults/:safe/activity`, `/vaults/:safe/red-team` | Điều hướng thuận tiện; red-team đã có bản gọn ở Tổng quan |
| Làm sau | `/vaults/:safe/policy`, `/vaults/:safe/funds` | Tổng quan đã có `PolicyStatus`, `PolicyForm`, `DepositWithdraw` ở dạng gọn |

---

## 2. App shell (mọi trang)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🛡 AgentShield   Demo  Tạo vault  Proof     ● Live   [Fuji] [0x12..ab ▾]│
└──────────────────────────────────────────────────────────────────────┘
```

| Thành phần | Mô tả |
|---|---|
| Nav | Demo · Tạo vault · Proof; `Vault của tôi` hiện khi có vault owner |
| Badge SSE | `● Live` (xanh) / `● Đang nối lại` (vàng) / `● Offline` (xám). Reconnect → refetch snapshot |
| Network guard | Sai chain → banner "Chuyển sang Avalanche Fuji" + nút `switchChain` |
| ConnectButton | RainbowKit; Core + MetaMask. Nút `Đăng nhập` (SIWE) chỉ cần khi owner thao tác API vault của mình hoặc admin; **khách ở `/demo` không cần ví** |
| Toast | Thành công/thất bại tx, 429 cooldown |
| Footer | Link repo, Snowtrace, `/proof` |

Responsive ≥ 375px: 3 cột → xếp dọc theo thứ tự Policy → Vault → Activity → Red-team (xem §4).

---

## 3. `/` Landing

**Mục đích:** người lạ hiểu sản phẩm trong ~30s (Q11), bấm vào demo.

```
┌ Hero ──────────────────────────────────────────────────────┐
│ "AI trade giúp bạn 24/7, nhưng không thể lấy tiền"           │
│ [Thử demo ngay]  [Tạo vault của bạn]                         │
├ Hai lớp khiên ────────────────────────────────────────────┤
│ Shield 1 (AI Auditor, off-chain) → Shield 2 (Contract)       │
├ 4 đòn tấn công thật ─ 4 thẻ: Over-withdraw · Wrong recipient │
│                       · Unlimited approval · Bypass website  │
├ Kill-Switch ─ "Tắt server đi, nút Kill vẫn chạy" (~1,5s)     │
├ Số liệu Fuji ─ finality · fuzz 10k runs · contract verified  │
└ Footer ───────────────────────────────────────────────────┘
```

- **Component:** `features/landing/{Hero,TwoShields,AttackCards,Stats}`.
- **API:** `GET /proof` cho dải số liệu; lỗi → ẩn dải, không chặn trang.
- **Trạng thái:** chỉ tĩnh; không cần ví.

---

## 4. `/demo` và `/vaults/:safe` — Dashboard (Tổng quan)

Đây là màn "nhìn 5 giây biết vault có an toàn không". Ở `/vaults/:safe` nó là **Tổng quan** và có thanh điều hướng tới các trang con (§10); ở `/demo` nó là **trang duy nhất** (không có thanh trang con, mọi thứ nằm trên một màn). Các khối dưới đây là bản gọn của §10: bấm "Xem tất cả" ở mỗi khối để sang trang con tương ứng (JobHistory → `/activity`, PolicyStatus → `/policy`, Balances → `/funds`).

**Thanh điều hướng vault (chỉ ở `/vaults/:safe/*`):** `Tổng quan · Hoạt động · Policy · Quỹ · Red-team · Cài đặt`; `Cài đặt` chỉ hiện với owner. **Nút Kill-Switch nằm ở `VaultHeader` của mọi trang con** (owner mới thấy), không phải chỉ ở Tổng quan, vì khi khẩn cấp không ai muốn tìm trong menu.

### 4.1 Layout (desktop ≥ 1024px)

```
┌ VaultHeader: 0xSafe..  [● Active]  Agent: 0xAgent..  [Snowtrace ↗] ─┐
├─────────────────┬────────────────────────────┬────────────────────┤
│ CỘT 1: Owner    │ CỘT 2: Vault & Activity   │ CỘT 3: Red-team    │
│                 │                            │                    │
│ PolicyStatus    │ BalancesBeforeAfter        │ RunRebalanceButton │
│  maxPerTx 500   │  USDC 3,000 → 2,800        │  [Run 200 USDC]    │
│  dailyCap 1,500 │  WAVAX 10  → 10.9          │                    │
│  expiry         │                            │ AttackButtons      │
│                 │ DailyBudgetBar             │  #1 Over-withdraw  │
│ PolicyForm      │  ████░░░░ 200 / 1,500      │  #2 Wrong recipient│
│ (owner only)    │                            │  #3 Unlimited appr.│
│                 │ JobTimeline + ExplanationCard │ #4 Bypass ⚡    │
│ [ KILL-SWITCH ] │  precheck→sim→invariant→   │                    │
│  (owner only)   │  chain  · badge llm|template│ InjectionBox      │
│                 │  [Snowtrace ↗]             │                    │
│ DepositWithdraw │ JobHistory (list)          │                    │
└─────────────────┴────────────────────────────┴────────────────────┘
```

Mobile (<1024px): xếp dọc 1 → 2 → 3, `KillSwitch` luôn dính đáy màn hình khi là owner.

### 4.2 Component ↔ nguồn dữ liệu

| Component (`features/…`) | Dữ liệu | Nguồn |
|---|---|---|
| `vault/VaultHeader` | địa chỉ, `isActive`, agent | `GET /vaults/{safe}` + `chain.revoked`/`chain.policy` |
| `policy/PolicyStatus` | limits theo token, expiry, epoch | wagmi `useReadContract` (chain trực tiếp) **hoặc** `state.policy` |
| `policy/PolicyForm` | form `maxPerTx`, `dailyCap`, `expiry` (schema từ `shared`) | wagmi write `setPolicy` — **không qua backend** |
| `kill-switch/KillSwitchButton` | độ trễ đo được | wagmi write `revoke`; hiển thị "Đã khoá sau X,Y giây" |
| `vault/BalancesBeforeAfter` | balances trước/sau job gần nhất | `state.balances` + `job.sim` |
| `vault/DailyBudgetBar` | `spentToday / dailyCap`, `budgetUsedPct` | `state.spentToday` (chain), cập nhật bởi `chain.swap` |
| `vault/DepositWithdraw` | nạp/rút Safe | wagmi: ERC20 transfer / Safe tx (owner) |
| `activity/JobTimeline` | các bước Shield 1 → Shield 2 | `GET /jobs/{id}` + `job.updated` |
| `activity/ExplanationCard` | `messageVi`, `source`, `verdict` | `job.explained` |
| `activity/JobHistory` | danh sách job | `GET /vaults/{safe}/jobs` + SSE |
| `red-team/RunRebalanceButton` | — | `POST /vaults/{safe}/jobs` |
| `red-team/AttackButtons` | — | `POST /vaults/{safe}/attacks` |
| `red-team/InjectionBox` | text | `POST /vaults/{safe}/attacks` (prompt-injection) |

### 4.3 Quyền và trạng thái nút

| Phần tử | Khách (không đăng nhập) | Owner (SIWE + on-chain) | Admin (SIWE + allowlist) |
|---|---|---|---|
| Xem state, job, SSE | ✅ | ✅ | ✅ |
| Run Rebalance, 4 đòn, injection | ✅ *chỉ vault demo công khai* (throttle IP + cooldown) | ✅ vault của mình | ✅ |
| PolicyForm, Kill, Deposit/Withdraw | ẩn | ✅ (ký ví, không qua backend) | ẩn nếu không là owner |
| Drawer admin (Demo mode, Bull Board, gas agent) | ẩn | ẩn | ✅ |

Owner được xác định **on-chain** (`Safe.getOwners`), backend chỉ kiểm lại để cấp cookie role.

### 4.4 Các trạng thái đặc biệt

| Tình huống | UI |
|---|---|
| `state.stale = true` (RPC lỗi) | Badge vàng "Dữ liệu cũ", giữ số cuối, tự thử lại |
| `isActive = false` (sau Kill) | Header đỏ 🔴, nút attack/rebalance vẫn bấm được và nhận `PolicyInactive` (đó là demo); PolicyForm hiện nút `Kích hoạt lại` (setPolicy mới → epoch mới, D10) |
| Hết budget ngày (demo, D15) | Banner "Shield 2 đang chặn: đã dùng hết hạn mức ngày"; không phải lỗi |
| Agent sắp hết gas | Chặn Run/attack, thông báo "Agent thiếu gas, thử lại sau" (A9) |
| HTTP 429 | Toast + đếm ngược cooldown theo vault |
| HTTP 403 (không phải owner) | Ẩn control owner, giữ read-only |
| Job `failed` (hạ tầng) | Thẻ xám "Lỗi hạ tầng, thử lại"; **không** auto-retry revert |
| Giải thích đến muộn | Thẻ job hiện ngay với skeleton ở dòng giải thích; `job.explained` điền sau, không nhảy layout |
| Gemini lỗi | Badge `template` (tính năng, không phải lỗi) |
| SSE rớt | Badge "Đang nối lại"; sau nối lại refetch `state`, `jobs` |

### 4.5 Màu và nhãn kết quả job

| Status | Thẻ | Nhãn |
|---|---|---|
| `confirmed` | Xanh | "An toàn, tiêu 13,3% hạn mức ngày" |
| `rejected` | Đỏ | "Shield 1 chặn" + reason code |
| `reverted` | Đỏ đậm + link Snowtrace | "Shield 2 chặn trên chain" |
| `failed` | Xám | "Lỗi hạ tầng" |
| `queued…broadcasting` | Xanh dương, spinner | tên bước hiện tại |

Mỗi reason code → câu tiếng Việt từ `shared/errors.ts` (Q1); UI không tự dịch.

### 4.6 Hai chế độ của `/demo`: Guided (mặc định) và Free play

**Cập nhật 2026-11-18:** `/demo` có hero "Try to break it." và nút chuyển chế độ, lưu trong URL (`?mode=free`). Mục tiêu: người không rành blockchain biết ngay phải bấm gì trước.

- **Guided** (`features/vault/demo/GuidedDemo.tsx`, logic thuần ở `guided.ts`). Bên trái là dải 4 bước, mỗi lần chỉ hiện **một thẻ bước**: câu chuyện bằng lời thường, khung "What should happen", **nút ngay trong bước**, và **kết quả hiện ngay dưới nút**. Kết quả gồm stamp, một câu giải thích, nút "See every check" (pipeline Shield 1 → 2) và link Snowtrace. Có `Next step`, `Skip this step`, `Back`. Bên phải là vault thật: "The agent's rules" (4 quy tắc đọc từ policy on-chain), Daily budget, Balances, cập nhật live sau mỗi lần bấm.
  1. **Normal trade**: rebalance 200 USDC. Số tiền tự giảm theo hạn mức ngày còn lại (USDC chẵn), để bước "bình thường" thật sự hợp lệ trên vault công khai.
  2. **Take too much**: attack over-withdraw → Shield 1 chặn, không có tx.
  3. **Hack around**: attack bypass → contract revert on-chain, link tx thất bại.
  4. **Emergency stop**: bản mock dùng Kill-Switch giữ-để-xác-nhận thật. Bản **live**: vault demo dùng chung nên **không** cho khách bấm. Thay vào đó là khối hazard giải thích chỉ ví owner ký được, nút "Got it" để hoàn thành bước, và link tạo vault riêng. Nhờ vậy hướng dẫn không bao giờ kẹt ở 3/4.

  Bước nào làm ở Free play trong cùng lần ghé (`lib/tour.ts` `tourProgress`) cũng được tính. Xong 4 bước thì có màn tổng kết "You tried to break it. It held." kèm CTA tạo vault, Free play, Start over. Cooldown của vault dùng chung hiện bằng lời thân thiện ("Someone else just ran a test…", nút đếm ngược "Your turn in Ns"), không báo như lỗi. Aura-kun nhảy tới thẻ bước và phản ứng theo kết quả.
- **Free play**: cho giám khảo hoặc người muốn thử mọi thứ. Bố cục theo vòng "bấm → đọc kết quả" để màn đầu (1320×778) chứa cả nút lẫn verdict, không phải cuộn:
  - Hero thu gọn (bỏ đoạn mô tả, h1 nhỏ hơn) vì người vào Free play đã biết ý tưởng.
  - **01 Pick a move** (cột trái): `RedTeamPanel layout="tabs"`, một thẻ với 3 tab Attacks (mặc định, 4 attack lưới 2×2) / Prompt injection / Normal trade, bên dưới là Recent jobs (4 dòng).
  - **02 Read the verdict** (cột phải, sticky trên desktop): VerdictCard của job vừa bấm hoặc job chọn trong Recent jobs. Trên điện thoại verdict nằm dưới, bấm xong tự cuộn tới.
  - **03 Watch the vault**: header vault (`VaultHeaderBar`, không tạo thêm query observer), Budget + Balances, Policy, Kill-Switch.
  - Trang `/vaults/:safe` (owner) và trang Red team giữ nguyên bố cục cũ. Thẻ "Try it in 4 steps" cũ đã bỏ vì Guided thay nó.

---

## 5. `/vaults/new/*` — Wizard tạo vault

Mỗi bước có URL riêng: `/vaults/new/safe`, `/module`, `/policy`, `/fund`. `/vaults/new` tự chuyển tới bước đầu tiên chưa xong. Đóng tab mở lại vào đúng bước; guard xem §1.1.

```
Bước:  ① Safe ─ ② Module ─ ③ Policy ─ ④ Nạp tiền ─ ✔ Xong
```

Cùng chuỗi bước với `packages/contracts/script/CreateVault.s.sol` (L4), nhưng owner ký trên trình duyệt (P2). Không bước nào đi qua server.

| Bước | Hành động ví (tx) | Điều kiện hoàn thành (đọc chain) |
|---|---|---|
| 1. Safe | `SafeProxyFactory.createProxyWithNonce` (Safe v1.4.1 L2, 1-of-1, owner = ví đang ký, salt ngẫu nhiên); hoặc dán địa chỉ Safe 1/1 đã có | ví nằm trong `getOwners()` |
| 2. Module | (a) `AgentShieldFactory.deployModule(safe)` (bỏ qua nếu `moduleOf(safe)` đã có); (b) `Safe.execTransaction(safe, enableModule(module))` chữ ký approved-hash | `isModuleEnabled(module)` |
| 3. Policy | Form điền sẵn 500 / 1.500 USDC, 20 / 60 WAVAX, 30 ngày → `setPolicy`. Agent = ví agent của server, router = Trader Joe, token USDC/WAVAX: lấy từ `deployments/fuji.json`, không cho sửa | policy active, có agent, chưa hết hạn |
| 4. Nạp tiền | Faucet MockUSDC/MockWAVAX (cooldown) → transfer vào Safe (panel chỉ có Nạp, không có Rút) | USDC hoặc WAVAX trong Safe > 0 |
| ✔ Xong | Không ký. Poll `GET /vaults/{safe}` (server tìm thấy module qua indexer hoặc đọc chain) → nút `Open your vault` | API trả 200 |

- **Code:** `shared/lib/wizard.ts` (dựng tham số, thuần), `shared/web3/wizardChain.ts` (đọc chain + gửi tx), `features/vault/hooks/useWizardControl.ts`, `features/vault/wizard/{WizardPage,WizardSteps}.tsx`.
- **Resume:** tiến trình suy ra từ **chain** mỗi lần vào (P1); chỉ lưu con trỏ `safe` ở `localStorage`. Địa chỉ Safe là CREATE2 nên được lưu ngay khi ký, đóng tab lúc tx đang mined vẫn tiếp tục được. Đã deploy module mà chưa bật → mở lại vào thẳng bước bật module.
- **Tự chuyển bước:** khi chain xác nhận bước đang làm, trang tự sang bước kế.
- **Dễ dùng:** đầu trang ghi còn khoảng mấy lần ký ví; bước 1 có nút kết nối ví ngay tại chỗ; cảnh báo khi ví đang ký khác tài khoản đã đăng nhập (vault sẽ thuộc ví đang ký); bước 3 tóm tắt policy bằng câu thường ("tối đa 500 USDC mỗi lệnh…, tới ngày …"); bước 4 nhắc lấy token từ faucet khi ví chưa có; lỗi revert hiện câu tiếng Anh dễ hiểu (NotSafeOwner, ModuleExists, GS013/GS025/GS026, FaucetCooldown); trang `/vaults` có banner `Continue setup` khi còn vault đang tạo dở.
- **Server chậm hoặc tắt:** sau 15 giây chưa thấy server nhận vault, nút `Open your vault` vẫn mở được (trang vault đọc thẳng chain khi API tắt).
- **Chặn:** Safe không thuộc ví, Safe nhiều chữ ký (threshold > 1), hoặc module do owner khác tạo → màn "Cannot continue" + nút `Start a new vault`.
- **Gas:** cảnh báo khi ví < 0,02 AVAX (fork test đo cả 8 tx ≈ 0,002 AVAX) kèm link faucet Core.
- **Lỗi:** user từ chối ký → giữ nguyên bước; tx revert → hiện reason code (chạy thử `simulateContract` trước khi mở ví); faucet cooldown → hiện thời gian chờ.
- **Sau khi xong:** vault vào registry nên rebalancer 24/7 sẽ tự giao dịch, tối đa `REBALANCE_MAX_VAULTS` vault (mặc định 5, vault cũ nhất trước; ví agent trả gas cho tất cả). Trang ghi rõ điều này.
- **Kiểm thử:** `wizardChain.fork.test.ts` chạy đủ 4 bước từ một ví mới trên fork Fuji (Safe factory + AgentShieldFactory thật) rồi giả lập agent swap được trong hạn mức, bị chặn khi vượt.
- Mục tiêu: ví mới tạo xong < 3 phút.

---

## 6. `/proof` — Bằng chứng

| Khối | Nội dung | Nguồn |
|---|---|---|
| Contracts | Module, Factory, MockUSDC, Safe demo: địa chỉ + `Verified ✓` + link Snowtrace | `GET /proof.contracts` |
| Finality | Thời gian Kill đo được: trung bình/min/max, 10 lần gần nhất | `GET /proof.finality` (từ `chain.revoked.latencyMs`) |
| Tests | fuzz 10,000 runs, invariant (3), Slither summary | `GET /proof.tests` |
| Tx đã chặn | Danh sách tx revert đòn #4 (`ExceedsPerTxCap`) có link | `GET /proof.blockedTxs` |
| Giới hạn đã biết | Cap theo đơn vị token, `minOut` do agent gửi, chỉ testnet (nói trung thực) | tĩnh |

Chỉ đọc; không cần ví.

---

## 7. Drawer Admin (D16)

Không phải route riêng. Nút "Admin" nằm ở header chung (`shared/shell/AdminEntry.tsx`), chỉ hiện trên `/demo` và `/vaults/*` khi dữ liệu live và `GET /auth/session` trả role `admin`; drawer có: trạng thái rebalancer (`Running` / `Demo mode on`, chu kỳ, lần chạy cuối), `Pause/Resume` (Demo mode; nút bấm tay vẫn chạy), địa chỉ agent + Snowtrace, số dư gas (cảnh báo dưới `AGENT_MIN_GAS_WEI`), link Bull Board, `/api/health`. Mở drawer thì tự làm mới 10s/lần; mất quyền (401/403) thì báo phiên không còn là admin. Lý do: admin cần bật Demo mode ngay lúc đứng ở dashboard khi trình diễn.

---

## 8. Luồng dữ liệu & quy ước

**Snapshot + stream** (không đảm bảo delivery):

```mermaid
flowchart LR
    SNAP["GET state, jobs"] --> QC[("QueryClient")]
    SSE["SSE /vaults/{safe}/events"] --> BR["realtime-bridge"] --> QC
    QC --> UI["Components"]
    UI -- "POST rebalance/attacks" --> API
    UI -- "setPolicy / revoke / deposit" --> WAGMI["wagmi → ví owner → Fuji"]
    WAGMI -. "PolicyRevoked" .-> SSE
```

- Mở **1 EventSource** mỗi vault đang xem, đóng khi rời trang.
- `ServerEvent` sai schema → bỏ, log; không crash.
- Query keys: `["vault", safe, "state"]`, `["vault", safe, "jobs"]`, `["job", id]`.
- Số tiền: `bigint` ↔ string; format bằng `shared/money`; **cấm** `Number()` trên số tiền.
- Luật FE: feature không import feature khác; chia sẻ qua `shared/`.

### Component dùng chung

| Component | Dùng ở |
|---|---|
| `SnowtraceLink` | dashboard, proof, toast |
| `AddressChip` (copy, rút gọn) | mọi trang |
| `TokenAmount` (bigint → hiển thị) | dashboard, wizard |
| `StatusBadge` (job/vault) | dashboard |
| `ExplanationCard` | dashboard |
| `TxButton` (state pending/confirmed/error, đo thời gian) | Kill, setPolicy, wizard |

---

## 9. Ma trận Trang ↔ API ↔ SSE

| Trang | REST | SSE event |
|---|---|---|
| `/` | `GET /proof` | — |
| `/demo`, `/vaults/:safe` (Tổng quan) | `GET /vaults/{safe}`, `GET /vaults/{safe}/state`, `GET /vaults/{safe}/jobs`, `GET /jobs/{id}`, `POST /vaults/{safe}/jobs`, `POST /vaults/{safe}/attacks`, auth (`/auth/*`) | `job.updated`, `job.explained`, `chain.swap`, `chain.policy`, `chain.revoked` |
| `/vaults/new/*` | `GET /vaults/{safe}`, `PUT /vaults/{safe}`, auth | `vault.registered` *(tuỳ chọn)* |
| `/proof` | `GET /proof` | — |
| Drawer Admin (trong dashboard) | `GET/PATCH /admin/rebalancer`, `GET /admin/queues`, `GET /api/health` | — |
| `/vaults` (danh sách) | `GET /vaults` | — |
| `/vaults/:safe/activity` | `GET /vaults/{safe}/jobs` | `job.updated`, `job.explained` |
| `/vaults/:safe/activity/:jobId` | `GET /jobs/{id}` | `job.updated`, `job.explained` |
| `/vaults/:safe/policy`, `/funds`, `/settings` | `GET /vaults/{safe}/state` | `chain.policy`, `chain.revoked`, `chain.swap` |
| `/vaults/:safe/red-team` | `POST /vaults/{safe}/jobs`, `POST /vaults/{safe}/attacks` | `job.updated`, `job.explained` |

---

## 10. Trang con của vault (`/vaults/:safe/*`)

Tất cả dùng `VaultLayout`: `VaultHeader` (địa chỉ, trạng thái, agent, Kill-Switch cho owner), breadcrumb, thanh điều hướng §4, badge SSE. Số tiền theo P5; reason code → câu tiếng Việt từ `shared/errors.ts`.

### 10.1 `/activity` — Hoạt động

- Bảng/danh sách job mới nhất trước: thời gian, loại (rebalance / tấn công), trạng thái (`StatusBadge` theo §4.5), số tiền, reason code.
- Lọc trên query string: `?status=confirmed|rejected|reverted|failed&type=rebalance|attack&page=N`. Có nút "Xoá lọc".
- Bấm một dòng → `/activity/:jobId`. Job mới đến qua SSE được chèn lên đầu và nháy nhẹ, không đẩy layout.
- Trạng thái trống: "Chưa có hoạt động nào" + nút tới `/red-team` (nếu được phép) hoặc `Run Rebalance`.

### 10.2 `/activity/:jobId` — Chi tiết job (link chia sẻ được)

- `JobTimeline` đầy đủ 4 bước (precheck → sim → invariant → chain), mỗi bước có thời gian và kết quả; bước đang chạy có spinner.
- `ExplanationCard` (`messageVi`, badge `llm|template`, verdict) — verdict, số tiền, chữ ký là deterministic (P3), LLM chỉ viết lời giải thích.
- Bảng "Trước / Sau": số dư, ngân sách ngày đã dùng; link Snowtrace nếu có tx; nút "Sao chép link".
- Job không tồn tại hoặc không thuộc vault này: 404 trong khung vault. Job đang chạy: tự cập nhật qua SSE.

### 10.3 `/policy` — Policy

- `PolicyStatus` đầy đủ: `maxPerTx`, `dailyCap`, `expiry` (đếm ngược), epoch, trạng thái; giải thích mỗi trường bằng 1 câu.
- `PolicyForm` (chỉ owner): kiểm tra bằng schema `shared` (số dương, `maxPerTx ≤ dailyCap`, `expiry` ở tương lai); bước **xem trước** "Bạn sắp ký giao dịch này" rồi mới `setPolicy`. Ký bằng ví trong browser, không qua backend (P2). `TxButton` hiện chờ ký → đang xử lý → xác nhận.
- Vault đã Kill: nút "Kích hoạt lại" (policy mới → epoch mới, D10).
- Lịch sử thay đổi policy từ sự kiện chain (thời điểm, giá trị cũ → mới, tx). Không có endpoint backend: FE đọc log on-chain bằng viem `getLogs` (xem `api.md` §12 điểm mở 6).
- Không phải owner: form ẩn, chỉ xem.

### 10.4 `/funds` — Quỹ

- Số dư theo token (`TokenAmount`), trước/sau job gần nhất.
- Tab Nạp / Rút (chỉ owner): nút Max, cảnh báo thiếu số dư, xem trước giao dịch, `TxButton`.
- Lịch sử chuyển từ chain (viem `getLogs`, không có endpoint backend), link Snowtrace.
- Không phải owner: chỉ xem.

### 10.5 `/red-team` — Thử tấn công

- `RunRebalanceButton` (ô nhập số tiền), 4 `AttackButtons`, `InjectionBox` với vài payload mẫu bấm để điền.
- Kết quả hiển thị ngay bên cạnh bằng `JobTimeline` + `ExplanationCard` của job vừa chạy, có link tới `/activity/:jobId`.
- Quyền theo §4.3 (khách chỉ vault demo công khai; throttle + cooldown hiển thị đếm ngược khi 429).
- Chặn Run/attack khi agent thiếu gas, hiện thông báo rõ.

### 10.6 `/settings` — Cài đặt (chỉ owner)

- Agent: địa chỉ, số dư gas, link Snowtrace.
- **Vùng nguy hiểm** (viền đỏ, ngăn cách rõ): Kill-Switch (giữ để kích hoạt, hiện "Đã khoá sau X,Y giây") và Kích hoạt lại sau Kill.
- Không phải owner: chuyển về Tổng quan kèm thông báo.

---

## 11. `/vaults` — Danh sách vault của tôi

- **Thẻ cho mỗi vault:** nhãn trạng thái, địa chỉ (`AddressChip`), thanh ngân sách ngày đã dùng, số dư USDC/WAVAX, job gần nhất (`GET /vaults/{safe}/jobs?limit=1`), nút `Open vault`. Vault demo công khai có thêm nhãn `Public demo`.
- **Trạng thái đọc từ chain** (`GET /vaults/{safe}/state` của từng vault, P1), không lấy từ registry:
  - `Incomplete`: module chưa từng có policy (`policyEpoch = 0` hoặc chưa có agent) → nút `Continue setup` trỏ wizard vào đúng Safe đó.
  - `Revoked`: đã bấm Kill-Switch.
  - `Protected`: còn lại. Hết hạn policy vẫn là `Protected` nhưng có cảnh báo vàng "Policy expired" + link `Set a new policy` (chủ vault chưa bấm Kill). Vault chưa có tiền có nhắc `Deposit`.
  - Một vault đọc lỗi chỉ báo trên thẻ đó, không làm hỏng cả trang.
- **Dữ liệu:** `GET /vaults` trả toàn bộ registry, FE lọc theo `owner` = ví đăng nhập (`api.md` §12 điểm mở 5), vault mới nhất lên đầu.
- **Vault đang tạo dở trong wizard:** server chỉ biết vault từ bước module, nên Safe trong con trỏ `localStorage` có thẻ riêng, đọc chain như wizard ("Next: step 2 of 4, Module"), nút `Continue setup` và `Remove from list` (chỉ quên trong trình duyệt). Thẻ này vẫn hiện khi API tắt.
- **Lọc và tìm:** All / Protected / Revoked / Incomplete kèm số lượng, ô tìm theo địa chỉ; cả hai nằm trên query string (`?status=revoked&q=ca43`). Không còn kết quả → `Clear filters`.
- **API tắt:** báo "danh sách có thể thiếu" + `Try again`; trang vault từng cái vẫn chạy từ chain.
- **Trạng thái trống:** một câu giải thích + `Create vault` và `Try the demo`. Nút `Create vault` luôn có ở đầu trang.
- Chưa đăng nhập ví: chuyển về `/signin` rồi quay lại.
- **Code:** `features/vault/list/{VaultListPage,VaultCard}.tsx`, `useMyVaults.ts`, `vaultList.ts` (luật thuần, có test).

