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
| `/vaults/new/safe` | Wizard bước 1: chọn/tạo Safe | ví kết nối | L9 | `GET /vaults/{safe}` | create Safe |
| `/vaults/new/module` | Wizard bước 2: triển khai + bật module | ví kết nối | L9 | `GET /vaults/{safe}` (poll đến khi indexer thấy), `PUT /vaults/{safe}` | createModule, enableModule |
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
| `safe` | `Safe.isOwner(ví)` với Safe đã chọn | (bước đầu, không có guard bước trước) |
| `module` | `Safe.isModuleEnabled(module)` | về `safe` kèm thông báo "Hoàn tất bước 1 trước" |
| `policy` | `isActive = true` | về bước đầu tiên chưa xong |
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

### 4.6 Guided tour (chỉ `/demo`)

4 bước tooltip: ① Run Rebalance → ② Over-withdraw → ③ Bypass ⚡ → ④ Kill-Switch. Có `Bỏ qua`; cắt được theo kế hoạch (thay bằng hướng dẫn tĩnh).

---

## 5. `/vaults/new/*` — Wizard tạo vault

Mỗi bước có URL riêng: `/vaults/new/safe`, `/module`, `/policy`, `/fund`. `/vaults/new` tự chuyển tới bước đầu tiên chưa xong. Đóng tab mở lại vào đúng bước; guard xem §1.1.

```
Bước:  ① Safe ─ ② Module ─ ③ Policy ─ ④ Nạp tiền ─ ✔ Xong
```

| Bước | Hành động ví | Điều kiện hoàn thành (đọc chain) |
|---|---|---|
| 1. Safe | Tạo Safe mới (Protocol Kit) hoặc chọn Safe đã có mà ví là owner | `Safe.isOwner(ví)` |
| 2. Module | Factory `createModule` + Safe `enableModule` | `Safe.isModuleEnabled(module)`; sự kiện `ModuleDeployed` |
| 3. Policy | Form policy → `setPolicy` | `isActive = true` |
| 4. Nạp tiền | `faucet` MockUSDC (có cooldown) → transfer vào Safe | balance Safe > 0 |

- **Resume:** tiến trình suy ra từ **chain** (không lưu trong DB, P1); lưu `safe` đang làm ở `localStorage` để đóng tab mở lại vẫn tiếp tục.
- **Sau bước 2:** poll `GET /vaults/{safe}` (≤ 5s theo A8) đến khi indexer đăng ký; nếu quá hạn có nút `Đăng ký thủ công` → `PUT /vaults/{safe}`.
- **Lỗi:** user từ chối ký → giữ nguyên bước; tx revert → hiện reason code; faucet cooldown → đếm ngược.
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

Không phải route riêng. Nút "Admin" ở app shell chỉ hiện khi session có role `admin`; mở drawer trên `/demo` hoặc `/vaults/:safe`: trạng thái rebalancer, `Pause/Resume` (Demo mode), link Bull Board, `/api/health`, số dư gas của agent. Lý do: admin cần bật Demo mode ngay lúc đứng ở dashboard khi trình diễn.

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

- Thẻ cho mỗi vault: địa chỉ rút gọn (`AddressChip`), trạng thái (Active / Revoked / Chưa hoàn tất), % ngân sách ngày đã dùng, job gần nhất.
- Dữ liệu: `GET /vaults` trả toàn bộ registry nên FE lọc theo `owner` = ví kết nối (xem `api.md` §12 điểm mở 5). Ô tìm theo địa chỉ; lọc Active / Revoked / Chưa hoàn tất.
- Vault chưa hoàn tất wizard: nút "Tiếp tục tạo" tới bước dang dở.
- Trạng thái trống: giải thích 1 câu + nút "Tạo vault" và "Thử demo".
- Chưa kết nối ví: chuyển về `/signin` rồi quay lại.
