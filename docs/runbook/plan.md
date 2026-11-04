# Kế hoạch triển khai AgentShield (v2)

> **v2, ngày 05/11/2026:** thiết kế lại sau khi đối chiếu với thể lệ Team1 Vietnam UniHack và audit code thật. Đội: **Lộc** (On-chain & Owner UX), **Đan Anh** (Platform, Backend & Production), **Duy Quốc** (Agent Intelligence & Experience).
> Spec kỹ thuật vẫn là `system-design.md`, `codebase.md`, `contracts.md`. File này trả lời: **đã có gì, còn thiếu gì, ai làm gì, hạn nào, làm xong kiểm bằng gì, được tự quyết tới đâu.**
> Bảng task để quản lý: `docs/runbook/tasks.csv` (import vào Google Sheet, xem mục 8). Mục 7 của file này và CSV sinh từ cùng một nguồn dữ liệu nên khớp nhau. Sửa task thì sửa cả hai (hoặc chỉ sửa Sheet, xem mục 8).

## 1. Mục tiêu và kết luận (đọc phần này trước)

### 1.1 Thể lệ cuộc thi (team1vn.xyz, đọc ngày 05/11)

- **Hạn nộp: 23:59 thứ Bảy 21/11/2026.** Nhóm tự đặt hạn **22:00 thứ Sáu 20/11**.
- **Bài nộp:** repo GitHub (public, hoặc private và thêm `tuantqse90`), link slide (Google Slides/Canva), **video demo 2–3 phút**, tài liệu khác. *Link nào giám khảo không mở được thì đội bị loại.*
- **Vòng online:** giám khảo xem video, slide, repo và **tự mở sản phẩm**. Họ không chạy được Anvil trên laptop của mình, nên **bắt buộc có URL production**.
- **Top 10** vào **Demo Day live 09:00 thứ Hai 30/11** tại Greenwich Vietnam (pitch, demo, Q&A).
- Mạng: Fuji testnet được chấp nhận. Track phù hợp: **"AI agents and security"**.

### 1.2 Thang điểm → task ăn điểm

| Tiêu chí | Điểm | Ăn điểm bằng |
|---|---|---|
| Technical Implementation | 25 | SC-2, SC-3 (fuzz 10k + invariant), BE-4 (sim Anvil), BE-7 (pipeline), AI-5 (25 case injection), BE-15/BE-16 (auth + hardening), SC-6 (Slither) |
| Avalanche Integration | 25 | SC-5 (mọi contract verify trên Snowtrace), SC-4 + WEB-6 (factory, tự tạo vault trên Fuji), WEB-4 + AV-1 (finality đo thật, Kill ~1,5s), trang /proof, Core wallet |
| Creativity & Innovation | 15 | 2 lớp khiên, 4 đòn tấn công thật (AI-8), LLM không có quyền (AI-4/5) |
| Impact & Use Case | 15 | Wizard "Tạo vault của bạn" (WEB-6), rebalancer 24/7 nhiều vault (AG-1), nạp/rút (WEB-5) |
| Presentation & Pitching | 10 | PT-1, TM-4, TM-5 |
| UI/UX & Demo | 10 | WEB-1 (design system), WEB-7, WEB-9 (landing + tour), URL production (OPS-2) |

### 1.3 Plan v1 còn thiếu gì (đã sửa trong v2)

1. **Lịch không gắn ngày thật**, video bị coi là "backup", không có task slide/nộp form/Demo Day. → v2 dùng ngày thật, có TM-4, TM-5, PT-1.
2. **Không có production**: cloud là DM-3 và bị cắt đầu tiên. → v2: VPS + CI/CD + giám sát (OPS-1 → OPS-4) là P0.
3. **Thiếu domain mà app thật nào cũng có**: auth/phân quyền (route admin đang mở toang), chống lạm dụng, onboarding + vòng đời vault (tạo, nạp, rút), multi-vault, reset sandbox, landing/hướng dẫn, README gốc, task riêng cho Avalanche. → BE-15, BE-16, SC-4, WEB-5, WEB-6, BE-10, D10, WEB-9, PT-1, AV-1.
4. **Lệch tải**: ngày 3–7 Đan Anh gánh ~44h việc khó nhất. → v2 chuyển SH-1, revert-decoder sang Lộc (gần contract), app shell sang Duy Quốc, rebalancer sang Duy Quốc (agent strategy).
5. **Thẻ task chỉ có "làm gì"**. → v2 thêm Mục tiêu, Được tự quyết, Không được phá, Mở khoá cho, Docs cập nhật.

### 1.4 Hiện trạng tóm tắt

- **Mới có khung, chưa có chức năng.** Server khoảng 1.500 dòng: module, queue, DB schema, event bus, SSE đã dựng; simulator, tx sender, indexer, vault, rebalancer, auditor đầy đủ còn là **stub hoặc TODO**.
- **Chưa có** `packages/contracts`, `packages/shared`, `scripts/seed.ts`, README gốc. Web mới là scaffold.
- **Đã kiểm chứng:** `tsc --noEmit` xanh; 7 unit test xanh. **Chưa kiểm chứng:** docker compose, `start.bat`, `pnpm dev`.
- **Đường găng:** SC-0 → SC-1 → SC-2 → SC-5 (Fuji) → BE-4/BE-5/BE-7 → **Milestone A 12/11** → OPS-2 (prod) → **Milestone B 17/11** → TM-4 (nộp 20/11).

## 2. Hiện trạng chi tiết theo module (audit 05/11, vẫn đúng)

Ký hiệu: ✅ dùng được · 🟡 có một phần · ❌ stub/TODO (compile nhưng không làm gì) · ⬜ chưa tồn tại.

### Hạ tầng và nền

| Hạng mục | Trạng thái | Đã có | Còn thiếu |
|---|---|---|---|
| Monorepo (pnpm, turbo), CI, check-invariants, skills sync | ✅ | CI 4 job (invariants, node, contracts, ci-pass), gitleaks, script kiểm P2/P4/P5 | CI job contracts đang "skip" vì chưa có foundry.toml |
| `infra/` docker compose | 🟡 | postgres 17, redis 7 (noeviction + AOF), anvil fork, healthcheck | Chưa chạy thử; chưa có api/worker/web trong compose; chưa có Dockerfile server |
| `start.bat` | 🟡 | Bootstrap env, install, docker, migrate, mở 2 terminal | Chưa kiểm chứng trên máy thật |
| `core/config` (Zod env, fail-fast) | ✅ | Validate đủ biến, không có owner key | — |
| `core/database` (Drizzle) | 🟡 | 4 schema (jobs, audit_log, chain_events + cursor, policy_snapshots) + migration 0000 | Lệch với §7 (status enum, thiếu origin/precheck/revert_error, audit_log thiếu shield/result) |
| `core/redis` (event bus), `core/queue` | ✅ | Pub/sub kênh chung, queue swap/attack/rebalance | ServerEvent mới có 2/5 loại (placeholder) |
| `core/chain` | 🟡 | Public client read-only có fallback transport | `contracts.ts` (getContract từ shared ABI) chưa có |
| `packages/shared` | ⬜ | — | Toàn bộ: schemas, events, errors, money, chain, abis |
| `packages/contracts` | ⬜ | — | Toàn bộ: module, mocks, test, script |
| `scripts/seed.ts` | ⬜ | — | Toàn bộ |

### Server modules

| Module | Trạng thái | Đã có | Còn thiếu |
|---|---|---|---|
| `jobs` | ✅ | create/transition/list/get, audit append, publish `job.updated`, `GET /jobs` | Đổi status theo D1; `GET /jobs/:id` kèm audit; gắn `job.explained` |
| `realtime` (SSE) | ✅ | `GET /events` từ event bus | Chỉ phát 2 loại event |
| `auditor` | 🟡 | Processor (concurrency 1), SwapQueueService (producer), `precheck.ts` + 4 test | AuditorService thiếu precheck/invariants/verdict; explain chạy tuần tự; không xử lý revert; precheck dùng policy chung (không per-token), mới 4/9 điều kiện, reason code khác contract; **chưa có** `invariants.ts`, `verdict.ts` |
| `rebalancer` | 🟡 | `computeRebalance` (bigint, 3 test), scheduler 15s, `POST /rebalance`, API/worker module tách đúng | Processor chỉ log; không đọc chain/giá; không clamp theo daily còn lại; `POST /rebalance` không nhận amountIn; chưa có route pause/resume; chưa test khác decimals |
| `simulation` | 🟡 | Port + FakeSimulator | **AnvilSimulator là stub** (throw) |
| `execution` | 🟡 | `agent-wallet.ts` (nonceManager, đúng ranh giới invariant 5), port, FakeTxSender | **ViemTxSender là stub** (throw); revert-decoder luôn trả UNKNOWN_REVERT; chưa có mutex/gas thủ công; port chỉ trả Hash (không phân biệt reverted) |
| `explainer` | 🟡 | Port, Service có fallback try/catch, Gemini adapter chạy được cơ bản, Template | Gemini: prompt 1 câu, không responseSchema, không `<untrusted_input>`; **chưa có** numeric-consistency, cache, queue explain, limiter; Template chèn mã lỗi tiếng Anh thô, không điền số |
| `policy` | ❌ | Service + repository | `getCurrentPolicy()` trả snapshot DB (ngược invariant 1); chưa đọc contract |
| `vault` | ❌ | `GET /state` | Chỉ trả `blockNumber`; thiếu balances, policy, spentToday, isActive |
| `indexer` | ❌ | Service + repository (đọc cursor) | Không poll, không handler, không publish `chain.*` |
| `redteam` | 🟡 | Controller, processor, 2/4 scenario (over-withdraw, wrong-recipient) | Thiếu unlimited-approval, bypass, prompt-injection, `/attacks/inject`; 2 scenario có sẵn dùng `minAmountOut=0` nên sẽ vướng ZeroMinOut |

### Web (`apps/web`)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Vite + React 19 + Tailwind 4 + dependency (wagmi ^2, RainbowKit, TanStack Query, Framer, RHF, Zustand) | ✅ | Đã cài, `components.json` shadcn đã có |
| App shell, providers, wagmi config, layout 3 cột | ⬜ | `main.tsx` chỉ render "AgentShield" |
| `features/policy`, `kill-switch`, `vault`, `activity`, `red-team` | ⬜ | Chỉ có file `.gitkeep` |
| `shared/api` (http, sse), `shared/web3` | ⬜ | Rỗng |

### Test hiện có
7 unit test (rebalance.math, precheck). Không có integration test, không có test web, không có test contract.

## 3. Quyết định chốt ở TM-0 (06/11)

Các điểm code lệch docs (D1–D8, từ audit) và các điểm mới do phạm vi v2 (D9–D16). Cột **Kết luận** điền trong buổi TM-0. Không chốt được thì: Lộc quyết contract/web3, Đan Anh quyết backend/infra, Duy Quốc quyết AI/UX.

| # | Vấn đề | Hiện trạng | Đề xuất | Kết luận |
|---|---|---|---|---|
| D1 | Tên trạng thái job | DB/code: `blocked`, `sending`. Docs §4.1: `rejected`, `broadcasting`, `reverted` | Theo docs (phân biệt rejected = Shield 1 chặn, reverted = Shield 2 chặn, rất quan trọng cho demo). Cần migration (BE-1) | |
| D2 | Hình dạng `SwapIntent` | Code: có `recipient`. Docs: thêm `origin`, `approval?` | `{tokenIn, tokenOut, amountIn, minAmountOut, recipient, origin}`. `recipient` chỉ để precheck/red-team; contract không có tham số này | |
| D3 | `TxSenderPort` và `SimResult` | Sender chỉ trả `Hash`. SimResult thiếu balance attacker và allowance | Sender trả `{hash, status, revertData?}` + `sendRaw(call, {gas})`. SimResult thêm `allowance`, `attackerBalance` | |
| D4 | `PrecheckPolicy` | Code: một `maxPerTx/dailyBudget` chung. Contract: limits **theo token** | Per-token: `limits[token]`, `spentToday[token]`, `agentSigner`, `router`, `expiry`, `now` (lấy từ block timestamp) | |
| D5 | Nguồn ABI cho `shared gen` | CI chạy gen rồi `git diff --exit-code`; job đó không có forge nên không đọc được `out/` | Commit ABI JSON vào `packages/contracts/abi/`; gen đọc file đó | |
| D6 | Reason code | Code: `EXCEEDS_MAX_PER_TX`. Contract: `ExceedsPerTxCap` | Một bảng trong `shared/errors.ts`, tên khớp error contract | |
| D7 | Owner key cho script deploy/seed | Invariant 5 cấm owner key trong backend/env | Dùng Foundry keystore (`cast wallet import`, `forge script --account`). `seed --verify` chỉ đọc | |
| D8 | Cặp token và decimals | USDC 6 / WAVAX 18; `priceAInB` scale 1e18 | Giá lấy từ `getAmountsOut(10^decA)` (đúng base unit). Thêm test khác decimals | |
| D9 | Owner của module | contracts.md còn ❓ | **EOA owner của Safe**; factory kiểm `ISafe.isOwner(msg.sender)`. Kill vẫn là 1 tx trực tiếp. Owner là chính Safe (multisig) để roadmap | |
| D10 | Reset budget | `setPolicy` không reset `spentInDay` → sandbox hết budget là kẹt | `policyEpoch++` mỗi lần setPolicy; `spent[epoch][token][dayId]`. Policy mới = budget mới (reset sandbox, kích hoạt lại sau Kill). Invariant test phủ epoch | |
| D11 | API multi-vault | Route đơn vault (`/state`, `/rebalance`) | `/vaults`, `/vaults/:safe/{state,jobs,rebalance,attacks/:scenario,attacks/inject}`, `/jobs/:id`. Mọi ServerEvent có `vault`; SSE `/events?vault=`. Bảng `vaults` chỉ là registry từ event `ModuleDeployed`, không chứa policy/spend (P1) | |
| D12 | Auth & phân quyền | Không có; route admin mở | SIWE (EIP-4361) + cookie JWT httpOnly. *visitor*: chỉ vault demo, có rate limit. *owner*: kiểm on-chain `Safe.getOwners`. *admin*: allowlist env. SIWE chỉ gác hành động backend thực thi; setPolicy/Kill vẫn ký trên browser (P2) | |
| D13 | Agent signer | 1 vault, 1 agent | 1 agent EOA dùng chung mọi vault (wizard điền sẵn `agentSigner`); 1 queue swap concurrency 1 (P4). Mỗi policy vẫn giới hạn rủi ro riêng từng vault. Session key riêng từng vault để roadmap | |
| D14 | Hạ tầng production | Chỉ có compose local | 1 VPS (≥ 2 vCPU, 4 GB) chạy `infra/docker-compose.prod.yml`: caddy (TLS), web static, api, worker, pg, redis, anvil. Domain riêng hoặc sslip.io. Secret trong `.env.prod` trên server. **Owner key không bao giờ lên server** | |
| D15 | Chính sách sandbox | — | Vault demo: maxPerTx 500, dailyCap 1.500 USDC. Hết budget → UI giải thích "Shield 2 đang chặn". Admin (Lộc) reset bằng setPolicy mới ký trên browser. Rebalancer tự động tắt cho vault demo | |
| D16 | Routes web | Chỉ `main.tsx` | `/` landing · `/demo` (dashboard vault demo + tour) · `/vaults/new` (wizard) · `/vaults/:safe` · `/proof` (contract verify, fuzz, Slither, tx then chốt) | |

Thêm bốn mục ❓ trong `contracts.md` (whitelist tách mapping?, nonReentrant, ...): Lộc chốt trong SC-0.

## 4. Charter: ai sở hữu gì, được tự quyết tới đâu

Mỗi người là **owner** của một mảng sản phẩm từ đầu đến cuối (code, test, docs, chất lượng trên production), không chỉ là người nhận ticket.

| | **Lộc**: On-chain & Owner UX | **Đan Anh**: Platform, Backend & Production | **Duy Quốc**: Agent Intelligence & Experience |
|---|---|---|---|
| Sứ mệnh | Luật trên chain không thể vượt qua, và owner tự tay kiểm soát tiền của mình | Hệ thống chạy thật, an toàn, 24/7 trên URL public | Agent thông minh nhưng không có quyền, và trải nghiệm khiến giám khảo "hiểu ngay" |
| Sở hữu (thư mục) | `packages/contracts`, `packages/shared/abis` + gen, `execution/revert-decoder`, `scripts/seed.ts`, web: `shared/web3`, `features/{policy,kill-switch,vault,onboarding,proof}` | `packages/shared/{schemas,events,money,chain}`, `core/*`, modules: policy, vault(s), simulation, execution (trừ decoder), auditor service, jobs, realtime, indexer, auth; `infra/`, `.github/workflows` (deploy), VPS; web: `features/auth` | `packages/shared/errors.ts`, `auditor/domain`, `explainer`, `rebalancer`, `redteam`; web: `app/`, `shared/{ui,api,store}` (design system), `features/{activity,red-team,landing,tour}`; pitch |
| Tự quyết | Thiết kế bên trong contract, tối ưu gas, UX ký ví (gộp bước, preset policy) | Thư viện, cấu trúc hạ tầng, ngưỡng rate limit, nhà cung cấp VPS | Prompt, copy tiếng Việt, ngôn ngữ thiết kế, câu chuyện pitch, chiến lược rebalance (deterministic) |
| Phải báo nhóm trước | Đổi ABI, event, error | Đổi DTO, ServerEvent, route API | Đổi reason code, component dùng chung trong `shared/ui` |
| Review chéo | PR của Đan Anh ở `execution`, `indexer` | PR của Lộc ở `shared/web3`, wizard | PR của Lộc và Đan Anh ở `apps/web` (thống nhất UI) |
| Stretch (chỉ sau M4) | Cổng kiểm giá Chainlink, owner multisig | Session key riêng từng vault, Avalanche Data API | Telegram báo owner khi bị tấn công, giao diện EN, báo cáo rủi ro ngày |

**Lối đi chung (không được chệch):**
- **P1–P5 và Shield 1/2** (skill `agentshield-invariants`) thắng mọi ý tưởng. Muốn làm khác thì sửa docs và báo nhóm trước.
- **Interface trước, code sau.** Sau tag `interfaces-v1`, mọi thay đổi `packages/shared` hoặc ABI phải báo trong nhóm chat và có người còn lại approve.
- **Sáng tạo nằm trong mảng của mình.** Nâng cấp ngoài thẻ chỉ làm khi mọi task P0 của mình đã Done; ghi ý tưởng vào tab Stretch trên Sheet trước khi làm.
- **Domain thuần** (`auditor/domain`, `rebalance.math`, guard) không import Nest/viem/drizzle, test < 1s.
- **Daily sync 10 phút** (hôm qua xong gì, hôm nay làm gì, bị chặn ở đâu). Mỗi task 1 nhánh, 1 PR nhỏ, review trong ngày.
- **Definition of Done của mọi task:** merge vào main + CI xanh + các test trong thẻ chạy + người review chéo xem qua + docs trong cột "Docs cập nhật" đã sửa + Status trên Sheet = Done. Từ M3 (14/11): **chạy được trên production**.

## 5. Lộ trình và cửa nghiệm thu (ngày thật, 2026)

| Mốc | Ngày | Điều kiện đạt (kiểm được) |
|---|---|---|
| **M0** Nền móng | T7 07/11 | D1–D16 có kết luận; tag `interfaces-v1`; `packages/shared` build; ABI draft commit; `start.bat` chạy sạch trên 3 máy; đã có VPS + DNS |
| **M1** Fake end-to-end | T3 10/11 | `POST /vaults/:safe/rebalance` → job đi hết state machine bằng Fake, SSE phát event, có explanation. Contract có test từng gate xanh |
| **M2 = Milestone A** | T5 12/11 | 1 swap thật trên Fuji (local stack): job `confirmed`, Snowtrace, `allowance = 0`, 3 lần liên tiếp (TM-1). Contract đã verify, factory đã deploy |
| **M3** Prod skeleton | T7 14/11 | `https://<domain>` chạy: landing, `/demo` đọc state thật, SSE (OPS-2) |
| **M4 = Milestone B** | T3 17/11 | **Trên production:** kịch bản 3 phút trọn vẹn, đủ 4 đòn + injection, wizard tạo vault mới, auth + rate limit bật, fuzz 10k xanh (TM-2) |
| **Freeze** | T4 18/11 | Tag `v1.0-rc`; bug bash chéo; `seed --verify` trên prod toàn PASS (TM-3) |
| **Nộp bài** | T5–T6 19–20/11 | Video, slide, README, repo public; **form Submitted trước 22:00 20/11** (TM-4). Tag `v1.0` |
| **Demo Day** | 22–30/11 | Rehearsal ×5, dự phòng; không deploy trong 24h trước 30/11 (TM-5) |

**Luật cắt phạm vi nếu trễ (cắt từ trên xuống):** Stretch → guided tour trong WEB-9 (thay bằng hướng dẫn tĩnh) → BE-11 (còn 1 kịch bản) → OPS-4 (chỉ giữ /health + uptime) → nút Rút tiền trong WEB-5 → fork test trong SC-6 (giữ Slither) → WEB-6 bản rút gọn (Safe tạo bằng script, wizard chỉ còn module + policy + nạp).
**Không bao giờ cắt:** contract + fuzz/invariant, đòn #4, Kill-Switch, fallback template, URL production, auth trên route admin, video, README.

**Điểm kiểm soát rủi ro:**
- **Contract trễ:** hết 10/11 contract chưa có test gate xanh → Đan Anh + Duy Quốc nhận viết test Foundry đơn giản, Lộc chỉ tập trung logic. SC-5 có thể chạy trên Anvil fork trước để không chặn backend.
- **Thanh khoản/địa chỉ Fuji:** rủi ro #1. SC-5 kiểm chứng địa chỉ TJ ngay 10/11, không đợi.
- **Production trễ:** OPS-1 bắt đầu ngay khi BE-7 chạy bằng Fake, không đợi Milestone A. Nếu 14/11 chưa có URL, Đan Anh dừng BE-10 để làm OPS-2.
- **Gas agent / quota Gemini trên prod:** BE-16 (chặn khi gas thấp) + OPS-4 (cảnh báo) + AI-7 (limiter). Nạp sẵn ≥ 5 AVAX test cho agent.
- **Giám khảo làm hết budget sandbox:** D10 + D15; kiểm sandbox mỗi sáng từ 18/11 đến 30/11.

## 6. Khối lượng theo người

Giờ là giờ làm thực, đã tính task chung (TM). Công suất giả định: ~7h/ngày × 15 ngày (06–20/11). Nếu chỉ có ~5h/ngày, áp dụng luật cắt ở mục 5 ngay từ 13/11.

| Người | Số task riêng | Giờ task riêng | Task chung đến 20/11 | **Tổng đến 20/11** | 06–12/11 | 13–17/11 | 18–20/11 | 22–30/11 |
|---|---|---|---|---|---|---|---|---|
| Lộc | 15 | 84h | 17h | **101h** | 45h | 38h | 18h | 8h |
| Đan Anh | 17 | 88h | 17h | **105h** | 54h | 35h | 16h | 8h |
| Duy Quốc | 16 | 87h | 17h | **104h** | 50h | 39h | 15h | 8h |

Chênh lệch giờ task riêng giữa 3 người: 4.5%. Tuần 1 nặng hơn vì có 2 ngày cuối tuần và phần lớn là việc thuần không phải chờ ai (contract, domain, schema).

### 6.1 Danh sách theo người

**Lộc**: On-chain & Owner UX

| ID | Hạn | h | Ưu tiên | Nội dung |
|---|---|---|---|---|
| SC-0 | T6 06/11 | 4 | P0 | Foundry scaffold + interface Module/Factory/MockUSDC + commit ABI draft |
| SH-1 | T7 07/11 | 3 | P0 | Scaffold packages/shared (@agentshield/shared) + script gen ABI |
| SC-1 | CN 08/11 | 6 | P0 | AgentPolicyModule: storage, setPolicy (có epoch), revoke, spentToday, events |
| SC-2 | T2 09/11 | 8 | P0 | executeGuardedSwap: gate 1→4 + gate 5 (thực thi qua Safe) |
| SC-4 | T3 10/11 | 5 | P0 | AgentShieldFactory + MockUSDC faucet + test |
| SC-5 | T4 11/11 | 8 | P0 | Deploy Fuji: MockUSDC, pool TJ, factory, Safe + module demo, policy; verify Snowtrace |
| SC-3 | T5 12/11 | 6 | P0 | Fuzz 10.000 runs + invariant test có Handler (gồm epoch, nhiều ngày) |
| BE-6 | T6 13/11 | 3 | P0 | revert-decoder: decodeErrorResult → reason code (custom error, GS104, lỗi router) |
| WEB-3 | T6 13/11 | 7 | P0 | Policy panel: PolicyForm + useSetPolicy (owner ký trên browser) + trạng thái + kích hoạt lại |
| WEB-4 | T7 14/11 | 4 | P0 | KillSwitchButton: revoke() từ ví owner, đo độ trễ, cả UI chuyển đỏ |
| WEB-5 | CN 15/11 | 7 | P0 | Vault panel: Balances trước/sau + DailyBudgetBar + Nạp tiền + Rút tiền |
| WEB-6 | T2 16/11 | 10 | P0 | Wizard /vaults/new: tạo Safe → deploy + enable module → setPolicy → faucet + nạp tiền |
| AV-1 | T2 16/11 | 4 | P0 | Gói Avalanche: trang /proof, helper link explorer, Core wallet ưu tiên, đo finality mọi tx |
| OPS-5 | T4 18/11 | 4 | P0 | scripts/seed.ts --verify: kiểm tra sẵn sàng (local và prod), chỉ đọc |
| SC-6 | T4 18/11 | 5 | P1 | Fork test Fuji (router TJ thật) + Slither + security-report.md |

**Đan Anh**: Platform, Backend & Production

| ID | Hạn | h | Ưu tiên | Nội dung |
|---|---|---|---|---|
| BE-0 | T6 06/11 | 3 | P0 | Xác nhận local chạy thật (start.bat → docker → migrate → pnpm dev) + đặt VPS/domain |
| SH-2 | T7 07/11 | 6 | P0 | Zod schema: SwapIntent, SimResult, JobDto, StateDto, VaultDto, Auth DTO, ServerEvent, money, chain |
| BE-1 | CN 08/11 | 4 | P0 | Migration 0001: status D1, origin/precheck/revert_error, audit shield/result, bảng vaults, jobs.vault |
| BE-2 | CN 08/11 | 4 | P0 | PolicyService.getCurrentPolicy(vault): đọc policy + limits + spentToday từ contract |
| BE-3 | T2 09/11 | 5 | P0 | Vault registry + GET /vaults, GET /vaults/:safe/state (cache 1s) |
| BE-5 | T2 09/11 | 6 | P0 | ViemTxSender thật: mutex + nonceManager + gas thủ công + receipt |
| BE-4 | T4 11/11 | 10 | P0 | AnvilSimulator thật: reset → impersonate agent → executeGuardedSwap → đọc state |
| BE-7 | T5 12/11 | 8 | P0 | AuditorService đầy đủ theo vault: precheck → sim → invariants → verdict → broadcast ‖ explain |
| BE-9 | T5 12/11 | 3 | P0 | POST /vaults/:safe/rebalance {amountIn}, admin pause/resume, GET /jobs/:id kèm audit |
| OPS-1 | T6 13/11 | 5 | P0 | Dockerfile (api|worker, web) + docker-compose.prod.yml + Caddyfile |
| OPS-2 | T7 14/11 | 5 | P0 | Dựng VPS: docker, firewall, TLS, .env.prod, fund agent — M3 prod chạy được |
| BE-10 | CN 15/11 | 8 | P0 | Indexer: factory ModuleDeployed → registry; event mọi module → chain.*; cursor idempotent |
| BE-15 | CN 15/11 | 6 | P0 | Auth SIWE: nonce/verify/me/logout + OwnerGuard (on-chain) + AdminGuard + nút Sign-in |
| BE-16 | T2 16/11 | 4 | P0 | Hardening production: throttler, cooldown theo vault, CORS, helmet, chặn khi agent sắp hết gas |
| OPS-3 | T2 16/11 | 4 | P0 | GitHub Actions deploy: build → GHCR → SSH deploy → migrate → smoke /health |
| OPS-4 | T4 18/11 | 3 | P1 | /health (pg, redis, rpc, anvil) + uptime monitor + cảnh báo Telegram (gas thấp, lỗi Gemini) |
| BE-11 | T4 18/11 | 4 | P1 | Integration test pipeline với Anvil thật (hợp lệ, vượt cap, kill rồi swap) |

**Duy Quốc**: Agent Intelligence & Experience

| ID | Hạn | h | Ưu tiên | Nội dung |
|---|---|---|---|---|
| SH-3 | T7 07/11 | 4 | P0 | shared/errors.ts: custom error → reason code → câu tiếng Việt |
| WEB-1 | CN 08/11 | 8 | P0 | App shell: router (D16), providers (wagmi v2, RainbowKit, Query), design system, responsive |
| AI-1 | T2 09/11 | 6 | P0 | precheck.ts đủ gate: mirror gate contract + kiểm ý đồ intent |
| AI-2 | T2 09/11 | 4 | P0 | invariants.ts: kiểm tra kinh tế sau sim |
| AI-3 | T3 10/11 | 3 | P0 | verdict.ts: verdict deterministic + budgetUsedPct |
| WEB-2 | T3 10/11 | 5 | P0 | http.ts (Zod, cookie) + sse.ts theo vault (reconnect) + realtime-bridge → QueryClient |
| AI-4 | T3 10/11 | 5 | P0 | GeminiExplainer chuẩn: responseSchema + prompt có <untrusted_input> + timeout |
| AI-6 | T4 11/11 | 4 | P0 | TemplateExplainer: câu tiếng Việt theo từng reason code, điền số thật |
| AI-5 | T5 12/11 | 6 | P0 | numeric-consistency guard + bộ ≥ 25 fixture prompt injection |
| AI-7 | T6 13/11 | 3 | P1 | ExplainerService: queue explain + cache + limiter RPM Gemini |
| AG-1 | T7 14/11 | 6 | P0 | Rebalancer: tick qua mọi vault active, giá getAmountsOut, clamp daily còn lại, idempotency |
| AI-8 | T7 14/11 | 8 | P0 | Red-team đủ 4 đòn + injection theo vault, POST /vaults/:safe/attacks/* |
| WEB-7 | CN 15/11 | 8 | P0 | Activity: JobTimeline (precheck→sim→invariant→chain) + ExplanationCard + ngăn chi tiết job |
| WEB-8 | T2 16/11 | 5 | P0 | Red-team panel: Run Rebalance, 4 AttackButtons, InjectionBox, Demo mode (admin) |
| WEB-9 | T3 17/11 | 6 | P0 | Landing + 'How it works' + guided tour cho /demo |
| PT-1 | T5 19/11 | 6 | P0 | Slide + script video 2–3 phút + cheat sheet FAQ + README gốc (dẫn dắt; Lộc, Đan Anh viết phần mình) |

**Cả nhóm**

| ID | Hạn | h | Ưu tiên | Nội dung |
|---|---|---|---|---|
| TM-0 | T6 06/11 | 2 | P0 | Kickoff: chốt D1–D16, tag interfaces-v1, dựng Sheet, đọc charter |
| TM-1 | T5 12/11 | 3 | P0 | MILESTONE A (12/11): 1 swap thật trên Fuji từ POST rebalance đến confirmed + Snowtrace |
| TM-2 | T3 17/11 | 3 | P0 | MILESTONE B (17/11): chạy trọn kịch bản 3 phút trên URL production |
| TM-3 | T4 18/11 | 4 | P0 | Feature freeze + bug bash chéo + demo-readiness, tag v1.0-rc |
| TM-4 | T6 20/11 | 5 | P0 | Quay video 2–3 phút + chốt slide + README + nộp form (trước 22:00 20/11) |
| TM-6 | T6 20/11 | 1 | P2 | (Tuỳ chọn) Builder Pass: mỗi người tự hoàn thành 5 quest |
| TM-5 | CN 29/11 | 8 | P0 | Chuẩn bị Demo Day 30/11 (nếu vào Top 10): rehearsal ×5, Q&A, phương án dự phòng |

### 6.2 Ánh xạ từ plan v1

- Giữ ID cũ khi phạm vi giữ nguyên: SC-0..3, SH-1..3, BE-0..7, BE-9..11, AI-1..8, PT-1 (= AI-11 cũ).
- Đổi số: SC-4 cũ (deploy) → **SC-5**; SC-5 + SC-6 cũ → **SC-6**; FE-1 → **WEB-1**; FE-2 → **WEB-2**; FE-3/4/5 → **WEB-3/4/5**; FE-6/7 → **WEB-7/8**; BE-8 → **AG-1**; BE-12 → **OPS-5**; BE-13 → **OPS-1**; BE-14 → BE-16 + OPS-4; SH-0 → **TM-0**; IT-1/IT-2 → **TM-1/TM-2**; DM-1/DM-2 → **TM-3/TM-5**.
- Gộp: AI-9 vào AI-5; FE-8 (polish) thành DoD của từng thẻ web + TM-3; FE-9 (test web) thành DoD của từng thẻ web. Bỏ: AI-10 (đo Gemini, đưa vào DoD của AI-7), DM-3 (thay bằng production thật).
- Mới: SC-4 (factory + faucet), BE-15 (auth), BE-16 (hardening), OPS-2/3/4 (VPS, CI/CD, giám sát), WEB-6 (wizard), WEB-9 (landing + tour), AV-1 (Avalanche), TM-4 (nộp bài), TM-6 (Builder Pass).

## 7. Thẻ task chi tiết

Mỗi thẻ gồm: **Owner · Hạn · Ước tính · Ưu tiên · Phụ thuộc · Mở khoá cho**, rồi **Mục tiêu** (vì sao, ăn tiêu chí nào), **Làm gì**, **Input → Output**, **Flow**, **Được tự quyết**, **Không được phá**, **Notes**, **Test / DoD**, **Docs cập nhật**.
Ưu tiên: **P0** bắt buộc · **P1** nên có, cắt được theo luật mục 5 · **P2** tuỳ chọn.

### P0 · 06–07/11 · Nền móng (→ M0)

#### TM-0 · Kickoff: chốt D1–D16, tag interfaces-v1, dựng Sheet, đọc charter
**Cả nhóm** · Hạn **T6 06/11** · 2h · P0 · mở khoá: SC-0

- **Domain / Layer:** Toàn dự án / Quyết định
- **Mục tiêu:** Khoá interface và phạm vi để 3 người code song song không vỡ khi ghép. Đây là điểm xung đột duy nhất của cả dự án.
- **Làm gì:**
  - Đi qua D1–D16 (mục 3), mỗi quyết định ghi 1 dòng kết luận ngay trong bảng.
  - Mỗi người đọc charter của mình (mục 4) và nói lại bằng 1 câu: mình sở hữu gì, mình giao gì cho ai, hạn nào.
  - Import tasks.csv vào Google Sheet (mục 8), tạo filter view theo Owner.
  - Sau khi SC-0 + SH-1 + SH-2 merge: tag `interfaces-v1`.
- **Input → Output:** Bảng D1–D16, 4 mục ❓ trong contracts.md → Bảng quyết định có kết luận; Sheet chạy; tag interfaces-v1 (cuối 07/11)
- **Được tự quyết:**
  - Đổi đề xuất D9–D16 nếu cả nhóm thấy phương án tốt hơn, miễn là ghi lại lý do.
- **Không được phá:**
  - Không chốt được trong 2h: Lộc quyết phần contract/web3, Đan Anh quyết phần backend/infra, Duy Quốc quyết phần AI/UX.
- **Notes:**
  - Họp 1 lần, tối đa 2h, ngày 06/11.
- **Test / DoD:**
  - [ ] Mỗi D1–D16 có cột kết luận
  - [ ] Sheet có 3 filter view
  - [ ] Ai cũng biết task đầu tiên của mình
- **Docs cập nhật:** plan.md §3 (kết luận); system-design/contracts nếu quyết định làm lệch spec

#### SC-0 · Foundry scaffold + interface Module/Factory/MockUSDC + commit ABI draft
**Lộc** · Hạn **T6 06/11** · 4h · P0 · phụ thuộc: TM-0 · mở khoá: SH-1, SC-1, BE-2, BE-5, SH-3

- **Domain / Layer:** packages/contracts / Smart contract (interface)
- **Mục tiêu:** Mở khoá cả nhóm ngay ngày 1: có ABI thật để backend/web gen type và code bằng Fake.
- **Làm gì:**
  - forge init trong packages/contracts; cài forge-std, OpenZeppelin, interface Safe (ISafe, Enum.Operation).
  - Viết IAgentPolicyModule (struct, custom error, event, có `policyEpoch` theo D10), IAgentShieldFactory (`deployModule`, event `ModuleDeployed(safe, module, owner)`), IMockUSDC (`faucet`).
  - forge build → xuất ABI sang packages/contracts/abi/*.json và commit (D5).
  - foundry.toml có profile `ci` (fuzz 1000).
  - Chốt D9, D10 và 4 mục ❓ trong contracts.md.
- **Input → Output:** contracts.md §2–§5, D9, D10 → forge build xanh; ABI draft được commit
- **Được tự quyết:**
  - Tên và thứ tự field bên trong struct, cách tổ chức thư mục src/test/script.
- **Không được phá:**
  - Không có hàm nào nhận recipient/path/approve từ agent.
  - Đổi ABI sau tag interfaces-v1 = báo nhóm trước.
- **Notes:**
  - Có ABI là SH-1, SH-2, SH-3, BE-2, BE-5 chạy được.
- **Test / DoD:**
  - [ ] `forge build` và `forge fmt --check` xanh
  - [ ] CI job contracts không còn skip
- **Docs cập nhật:** contracts.md (D9, D10, factory, faucet; xoá các mục ❓ đã chốt)

#### BE-0 · Xác nhận local chạy thật (start.bat → docker → migrate → pnpm dev) + đặt VPS/domain
**Đan Anh** · Hạn **T6 06/11** · 3h · P0 · mở khoá: BE-4

- **Domain / Layer:** infra / Hạ tầng
- **Mục tiêu:** Cả nhóm clone về là chạy được trong ≤ 10 phút; production có máy sẵn từ ngày 1.
- **Làm gì:**
  - Chạy start.bat trên máy thật, sửa mọi lỗi (FORK_URL, cổng, drizzle migrate).
  - Xác nhận api (4000) + worker cùng lên, /admin/queues mở được, SSE /events giữ kết nối.
  - Thuê VPS (≥ 2 vCPU, 4 GB) + domain hoặc dùng sslip.io; chỉ tạo máy, cài đặt làm ở OPS-2.
- **Input → Output:** infra/.env, apps/server/.env từ example; 1 Fuji RPC URL → Local chạy được trên 3 máy; có IP VPS
- **Được tự quyết:**
  - Chọn nhà cung cấp VPS (Hetzner, DigitalOcean, Azure for Students...).
- **Không được phá:**
  - Không commit .env.
- **Test / DoD:**
  - [ ] curl localhost:4000/state trả JSON
  - [ ] docker compose ps: pg/redis/anvil healthy
  - [ ] Có IP + DNS VPS
- **Docs cập nhật:** setup-and-bringup.md (lỗi gặp và cách sửa)

#### SH-1 · Scaffold packages/shared (@agentshield/shared) + script gen ABI
**Lộc** · Hạn **T7 07/11** · 3h · P0 · phụ thuộc: SC-0 · mở khoá: SH-2, SH-3, WEB-1

- **Domain / Layer:** packages/shared / Hạ tầng monorepo
- **Mục tiêu:** Một nguồn type duy nhất cho contract ↔ server ↔ web.
- **Làm gì:**
  - package.json, tsconfig, export index, build bằng tsup hoặc tsc.
  - Script `gen` (@wagmi/cli) đọc ABI đã commit trong packages/contracts/abi/*.json (D5), xuất `abis/`.
  - Server và web thêm dependency `workspace:*` và import thử 1 symbol.
- **Input → Output:** ABI JSON từ SC-0 → `pnpm --filter shared gen` xanh; server + web import được
- **Được tự quyết:**
  - Chọn tsup hay tsc; cách export subpath.
- **Không được phá:**
  - gen KHÔNG đọc packages/contracts/out (CI node không có forge).
- **Notes:**
  - Đan Anh tiếp quản schemas/events/money/chain ngay sau (SH-2); Duy Quốc giữ errors.ts (SH-3).
- **Test / DoD:**
  - [ ] `pnpm typecheck` toàn repo xanh
  - [ ] CI bước shared codegen + git diff --exit-code xanh
- **Docs cập nhật:** codebase.md (mục packages/shared)

#### SH-2 · Zod schema: SwapIntent, SimResult, JobDto, StateDto, VaultDto, Auth DTO, ServerEvent, money, chain
**Đan Anh** · Hạn **T7 07/11** · 6h · P0 · phụ thuộc: SH-1 · mở khoá: BE-1, BE-2, BE-5, BE-4, AI-1, AI-2, WEB-2, AI-4

- **Domain / Layer:** packages/shared / Contract dữ liệu (Zod)
- **Mục tiêu:** Interface giữa 3 người: có schema là ai cũng code được bằng Fake.
- **Làm gì:**
  - Thay 2 placeholder (core/types.ts, core/redis/server-event.ts) bằng import từ shared.
  - SwapIntent theo D2 + field `vault`; SimResult theo D3; PrecheckPolicy theo D4; JobStatus theo D1.
  - ServerEvent đủ 5 loại, mọi event có `vault` (D11). StateDto, VaultDto, SiweNonce/SiweVerify/Me (D12).
  - money.ts: parse/format bigint ↔ string. chain.ts: avalancheFuji, decimals (USDC 6, WAVAX 18), địa chỉ từ deployments.
- **Input → Output:** system-design §4.1, §7, §8.3 + D1–D4, D11, D12 → schemas/*.ts, events.ts, money.ts, chain.ts; server compile
- **Được tự quyết:**
  - Cách chia file schema.
- **Không được phá:**
  - Số tiền: string trong JSON, bigint trong code, NUMERIC(78,0) trong DB (P5).
  - Đổi shared sau interfaces-v1 = báo nhóm trước.
- **Test / DoD:**
  - [ ] Vitest: round-trip bigint
  - [ ] ServerEvent.parse từ chối payload sai
  - [ ] typecheck xanh sau khi xoá placeholder
- **Docs cập nhật:** system-design §8 (API multi-vault, event có vault)

#### SH-3 · shared/errors.ts: custom error → reason code → câu tiếng Việt
**Duy Quốc** · Hạn **T7 07/11** · 4h · P0 · phụ thuộc: SH-1, SC-0 · mở khoá: BE-6, AI-1, AI-4, AI-6

- **Domain / Layer:** packages/shared / Nội dung (tiếng Việt)
- **Mục tiêu:** Một từ điển lý do chặn dùng chung cho decoder, explainer và UI.
- **Làm gì:**
  - Bảng duy nhất: custom error của module + factory, lỗi off-chain (RECIPIENT_NOT_ALLOWED, UNLIMITED_APPROVAL, INVARIANT_*, AGENT_LOW_GAS, RATE_LIMITED…), GS104, UNKNOWN_REVERT.
  - Mỗi mục: { code, shield: 1|2, messageVi (≤ 140 ký tự, có chỗ điền số) }; hàm describeReason(code, ctx).
- **Input → Output:** contracts.md §4, ABI SC-0 → errors.ts + test độ phủ
- **Được tự quyết:**
  - Giọng văn tiếng Việt.
- **Không được phá:**
  - Tên code khớp 1-1 tên error contract (D6).
- **Test / DoD:**
  - [ ] Test: mọi error trong ABI có mục trong errors.ts
  - [ ] Không câu nào dùng float

### P1 · 08–12/11 · Vertical slice (→ Milestone A)

#### SC-1 · AgentPolicyModule: storage, setPolicy (có epoch), revoke, spentToday, events
**Lộc** · Hạn **CN 08/11** · 6h · P0 · phụ thuộc: SC-0 · mở khoá: SC-2, SC-4

- **Domain / Layer:** packages/contracts / Smart contract
- **Mục tiêu:** Shield 2: luật trên chain mà backend bị chiếm cũng không vượt qua được. [Technical 25]
- **Làm gì:**
  - Policy{agentSigner, router, expiry, isActive}, Limits{maxPerTx, dailyCap}, limits[token], policyEpoch, spent[epoch][token][dayId].
  - setPolicy chỉ owner (D9); require router≠0, agentSigner≠0, expiry>now; mỗi lần gọi `policyEpoch++` (D10); emit PolicySet.
  - revoke chỉ owner → isActive=false; emit PolicyRevoked(by, at).
  - view spentToday(token) = spent[policyEpoch][token][block.timestamp / 1 days].
- **Input → Output:** Tx từ owner (setPolicy/revoke) → State + event đúng
- **Được tự quyết:**
  - Tối ưu gas, cách đóng gói storage.
- **Không được phá:**
  - Owner key không bao giờ dùng trong backend (P2, invariant 5).
- **Notes:**
  - dayId theo UTC (00:00 UTC = 7h sáng VN).
- **Test / DoD:**
  - [ ] Unit: non-owner setPolicy/revoke revert
  - [ ] Unit: tham số xấu revert
  - [ ] Unit: setPolicy mới → spentToday về 0 (epoch)
  - [ ] Unit: revoke → isActive=false + event
- **Docs cập nhật:** contracts.md §2–§3

#### BE-1 · Migration 0001: status D1, origin/precheck/revert_error, audit shield/result, bảng vaults, jobs.vault
**Đan Anh** · Hạn **CN 08/11** · 4h · P0 · phụ thuộc: SH-2 · mở khoá: BE-7

- **Domain / Layer:** core/database + jobs / Dữ liệu (Drizzle)
- **Mục tiêu:** DB khớp spec trước khi có dữ liệu thật.
- **Làm gì:**
  - Đổi pgEnum job_status theo D1 (rejected/reverted/broadcasting…).
  - jobs: origin, precheck (jsonb), revert_error, vault; audit_log: shield, result, reason.
  - Bảng vaults (safe PK, module, owner, created_block, label, is_demo): chỉ là registry (D11).
  - policy_snapshots khớp §7.
- **Input → Output:** D1, D11, schema §7 → drizzle-kit generate + migrate chạy trên DB sạch và DB đã có 0000
- **Được tự quyết:**
  - Index và tên cột phụ.
- **Không được phá:**
  - Bảng vaults không chứa policy/limits/spent (P1).
- **Notes:**
  - Đổi enum Postgres cần migration thủ công.
- **Test / DoD:**
  - [ ] Migrate từ DB trống xanh
  - [ ] JobsService.transition test với status mới
- **Docs cập nhật:** system-design §7 (bảng vaults)

#### BE-2 · PolicyService.getCurrentPolicy(vault): đọc policy + limits + spentToday từ contract
**Đan Anh** · Hạn **CN 08/11** · 4h · P0 · phụ thuộc: SC-0, SH-2 · mở khoá: BE-3, BE-7

- **Domain / Layer:** modules/policy / Application service (đọc chain)
- **Mục tiêu:** Giữ P1: precheck luôn dùng dữ liệu chain mới nhất của đúng vault.
- **Làm gì:**
  - viem multicall tới module của vault: policy(), limits(tokenIn/out), spentToday(token), policyEpoch, block.timestamp.
  - Trả PrecheckPolicy (D4). RPC lỗi mới fallback policy_snapshots và gắn `stale: true`.
- **Input → Output:** ABI shared, địa chỉ module từ registry → PrecheckPolicy theo block hiện tại
- **Flow:** AuditorService → PolicyService → public client (fallback transport) → module
- **Không được phá:**
  - Không ghi spentToday vào DB.
  - Dùng block timestamp, không Date.now().
- **Test / DoD:**
  - [ ] Test client mock: map đúng struct
  - [ ] RPC lỗi → snapshot + stale

#### WEB-1 · App shell: router (D16), providers (wagmi v2, RainbowKit, Query), design system, responsive
**Duy Quốc** · Hạn **CN 08/11** · 8h · P0 · phụ thuộc: SH-1 · mở khoá: WEB-3, WEB-4, AV-1, BE-15, WEB-2, WEB-9

- **Domain / Layer:** apps/web/app + shared/ui / Frontend (shell + design system)
- **Mục tiêu:** Nền giao diện thống nhất để 3 người cùng dựng feature mà vẫn trông như một sản phẩm. [UI/UX 10]
- **Làm gì:**
  - Router: /, /demo, /vaults/new, /vaults/:safe, /proof (trang trống có layout).
  - providers.tsx, wagmi config Fuji (fallback transports; Lộc review phần shared/web3).
  - Design system theo skill frontend-design: token màu (xanh = an toàn, đỏ = chặn), font, Card/Badge/Button/Progress/Toast (shadcn), layout 3 cột 1080p + responsive ≥ 375px.
- **Input → Output:** env VITE_* → Shell chạy, kết nối ví được, trang mẫu component
- **Được tự quyết:**
  - Toàn bộ ngôn ngữ thiết kế: màu, font, motion, tránh giao diện template.
- **Không được phá:**
  - wagmi pin ^2 (skill wagmi nhắm v3: đối chiếu API).
  - Feature không import feature khác; chia sẻ qua shared/.
- **Test / DoD:**
  - [ ] Vitest: render App không lỗi
  - [ ] Kết nối Core/MetaMask trên Fuji
  - [ ] Lighthouse mobile không vỡ layout
- **Docs cập nhật:** codebase.md (mục frontend: routes, design token)

#### SC-2 · executeGuardedSwap: gate 1→4 + gate 5 (thực thi qua Safe)
**Lộc** · Hạn **T2 09/11** · 8h · P0 · phụ thuộc: SC-1 · mở khoá: SC-5, SC-3, BE-6

- **Domain / Layer:** packages/contracts / Smart contract (core)
- **Mục tiêu:** Chứng minh 'AI không thể lấy tiền' bằng code on-chain. Đây là trái tim của sản phẩm. [Technical 25, Creativity 15]
- **Làm gì:**
  - Thứ tự gate đúng contracts.md §4 (2000 USDC phải ra ExceedsPerTxCap, không phải ExceedsDailyCap).
  - Gate 5: path=[tokenIn,tokenOut] build trong module; balBefore; Safe.approve(router, amountIn) exact; swapExactTokensForTokens(..., to=safe, deadline); delta ≥ minOut; allowance==0; tăng spent trước call ngoài; emit GuardedSwap.
  - Mọi call qua safe.execTransactionFromModule với Enum.Operation.Call hard-code.
  - nonReentrant (theo kết luận ❓).
- **Input → Output:** (tokenIn, tokenOut, amountIn, minOut, deadline) từ agentSigner → Swap thành công hoặc revert đúng custom error
- **Flow:** msg.sender==agent → isActive → expiry → whitelist/khác token → ≤maxPerTx → ≤daily còn lại → minOut>0 → deadline ≤ now+10m → approve exact → swap → check delta/allowance → emit
- **Được tự quyết:**
  - Cấu trúc mock (MockRouter, MockSafe) và helper test.
- **Không được phá:**
  - Không bao giờ DelegateCall.
  - Không tin giá trị trả về của router: đo balance trước/sau.
- **Test / DoD:**
  - [ ] Mỗi gate có 1 test revert đúng error
  - [ ] Biên: == maxPerTx pass, == dailyCap pass, +1 revert
  - [ ] vm.warp qua ngày mới → counter về 0
- **Docs cập nhật:** contracts.md §4

#### BE-3 · Vault registry + GET /vaults, GET /vaults/:safe/state (cache 1s)
**Đan Anh** · Hạn **T2 09/11** · 5h · P0 · phụ thuộc: BE-2 · mở khoá: WEB-5, OPS-5, BE-15, AG-1

- **Domain / Layer:** modules/vault + vaults / API (REST)
- **Mục tiêu:** Web có một snapshot đáng tin cho mọi vault (demo và vault người dùng tạo).
- **Làm gì:**
  - VaultsRepository + seed vault demo từ deployments/fuji.json (is_demo=true).
  - GET /vaults (filter ?owner=), GET /vaults/:safe/state: balances 2 token, policy, limits, spentToday, isActive, expiry, blockNumber.
  - Cache 1s theo vault; bigint → string; response parse bằng StateDto.
- **Input → Output:** GET → JSON StateDto / VaultDto[]
- **Được tự quyết:**
  - Cách tổ chức module vaults vs vault.
- **Không được phá:**
  - State luôn đọc chain (P1).
- **Notes:**
  - FE reconnect SSE sẽ gọi lại endpoint này.
- **Test / DoD:**
  - [ ] Test serialize bigint
  - [ ] Test cache 1s
  - [ ] Response parse được bằng StateDto
- **Docs cập nhật:** system-design §8.1

#### BE-5 · ViemTxSender thật: mutex + nonceManager + gas thủ công + receipt
**Đan Anh** · Hạn **T2 09/11** · 6h · P0 · phụ thuộc: SC-0, SH-2 · mở khoá: TM-1, BE-7, AI-8

- **Domain / Layer:** modules/execution / Adapter (viem, giữ session key)
- **Mục tiêu:** Một cửa duy nhất ký bằng session key, không bao giờ lệch nonce. [Technical 25]
- **Làm gì:**
  - Build calldata executeGuardedSwap tới module của vault.
  - Mutex dùng chung cho swap và attack của mọi vault (P4, D13).
  - Tuỳ chọn `gas` thủ công để tx revert vẫn được mined (cần cho đòn #4).
  - Port: sendSwap trả {hash, status, revertData?} (D3); thêm sendRaw cho red-team.
  - Retry chỉ lỗi hạ tầng (timeout/5xx), tối đa 3 lần; KHÔNG retry revert.
- **Input → Output:** SwapIntent hoặc raw call + {gas} → Kết quả tx có receipt
- **Flow:** lock → calldata → writeContract(gas?) → waitForTransactionReceipt → unlock → map
- **Không được phá:**
  - Chỉ modules/execution dùng session key (check-invariants.sh).
- **Notes:**
  - Agent cần AVAX cả cho tx revert.
- **Test / DoD:**
  - [ ] FakeTxSender thoả port mới
  - [ ] Unit: mutex tuần tự hoá 2 lời gọi song song
  - [ ] Integration: tx revert có gas thủ công vẫn có hash

#### AI-1 · precheck.ts đủ gate: mirror gate contract + kiểm ý đồ intent
**Duy Quốc** · Hạn **T2 09/11** · 6h · P0 · phụ thuộc: SH-2, SH-3 · mở khoá: BE-7, AI-3

- **Domain / Layer:** modules/auditor/domain / Domain thuần
- **Mục tiêu:** Shield 1 chặn ngoài cửa, không tốn gas, trước khi lệnh lên chain. [Technical 25]
- **Làm gì:**
  - Viết lại theo D4 (per-token): signer, isActive, expiry, whitelist, tokenIn≠tokenOut, ≤ maxPerTx, ≤ daily còn lại, minOut>0, deadline ≤ now+10m.
  - Kiểm intent không biểu diễn được qua ABI: recipient == Safe, approval == amountIn.
  - Thứ tự khớp contract (2000 USDC → ExceedsPerTxCap trước ExceedsDailyCap).
- **Input → Output:** SwapIntent + PrecheckPolicy + now → PrecheckResult { ok } | { ok:false, reasonCode, shield:1 }
- **Được tự quyết:**
  - Thêm kiểm tra heuristic (cảnh báo, không chặn) nếu có lý do rõ.
- **Không được phá:**
  - Không import @nestjs/viem/drizzle.
  - Không float (P5).
- **Test / DoD:**
  - [ ] Table-driven: 1 case/gate + biên
  - [ ] Test thứ tự ưu tiên reason

#### AI-2 · invariants.ts: kiểm tra kinh tế sau sim
**Duy Quốc** · Hạn **T2 09/11** · 4h · P0 · phụ thuộc: SH-2 · mở khoá: BE-7, AI-3

- **Domain / Layer:** modules/auditor/domain / Domain thuần
- **Mục tiêu:** Sim không revert chưa chắc an toàn: lớp này bắt kết quả kinh tế sai.
- **Làm gì:**
  - ΔSafe(tokenOut) > 0 và ≥ minOut; ΔSafe(tokenIn) == −amountIn; Δattacker == 0; allowance(router) == 0.
  - Trả danh sách invariant fail kèm code.
- **Input → Output:** SwapIntent + SimResult → InvariantResult { ok } | { ok:false, failed: Code[] }
- **Không được phá:**
  - Domain thuần, bigint.
- **Test / DoD:**
  - [ ] Mỗi invariant 1 case pass + 1 fail
  - [ ] Bigint ≥ 2^64 không rơi vào float

#### SC-4 · AgentShieldFactory + MockUSDC faucet + test
**Lộc** · Hạn **T3 10/11** · 5h · P0 · phụ thuộc: SC-1 · mở khoá: SC-5, BE-10

- **Domain / Layer:** packages/contracts / Smart contract (factory)
- **Mục tiêu:** Ai cũng tự tạo được vault của mình: biến demo thành sản phẩm. [Impact 15, Avalanche 25]
- **Làm gì:**
  - Factory.deployModule(safe, router): require ISafe(safe).isOwner(msg.sender) (D9); deploy module (CREATE2 theo safe để địa chỉ dự đoán được); emit ModuleDeployed(safe, module, owner).
  - MockUSDC: `faucet()` mint 10.000 USDC, cooldown 1h mỗi địa chỉ; `mint` cho deployer.
  - Test: non-owner không deploy được; deploy 2 lần cùng safe bị chặn hoặc trả về module cũ; faucet cooldown.
- **Input → Output:** — → Factory + MockUSDC có test xanh
- **Được tự quyết:**
  - Clone (EIP-1167) hay new; có gộp enableModule vào luồng Safe setup hay không (miễn wizard ≤ 4 lần ký).
- **Không được phá:**
  - Factory không giữ quyền gì trên module sau khi deploy.
- **Notes:**
  - Indexer (BE-10) dùng event ModuleDeployed để đăng ký vault.
- **Test / DoD:**
  - [ ] forge test xanh cho factory + faucet
  - [ ] ABI factory/faucet đã commit và gen lại shared
- **Docs cập nhật:** contracts.md (mục Factory, MockUSDC)

#### AI-3 · verdict.ts: verdict deterministic + budgetUsedPct
**Duy Quốc** · Hạn **T3 10/11** · 3h · P0 · phụ thuộc: AI-1, AI-2 · mở khoá: BE-7

- **Domain / Layer:** modules/auditor/domain / Domain thuần
- **Mục tiêu:** Số tiền và quyết định do toán, không do LLM (P3).
- **Làm gì:**
  - Precheck + invariants → safe | blocked.
  - budgetUsedPct = (spentToday + amountIn) / dailyCap tính bằng basis points bigint, làm tròn 1 chữ số (chốt 1 quy tắc).
- **Input → Output:** PrecheckResult, InvariantResult, spentToday, dailyCap, amountIn → { verdict, budgetUsedPct, reasonCode? }
- **Không được phá:**
  - Không Number() trên bigint lớn.
- **Notes:**
  - Ví dụ demo: 200/1500 → 13,3%.
- **Test / DoD:**
  - [ ] 200/1500 = 13.3
  - [ ] amountIn = 0, dailyCap rất lớn, biên làm tròn
  - [ ] Không > 100 hoặc NaN

#### WEB-2 · http.ts (Zod, cookie) + sse.ts theo vault (reconnect) + realtime-bridge → QueryClient
**Duy Quốc** · Hạn **T3 10/11** · 5h · P0 · phụ thuộc: SH-2, WEB-1 · mở khoá: WEB-5, WEB-7, WEB-8

- **Domain / Layer:** apps/web/shared/api + app/realtime-bridge / Frontend (data)
- **Mục tiêu:** Mọi panel dùng chung một lớp dữ liệu live, không ai tự fetch kiểu riêng.
- **Làm gì:**
  - fetch wrapper: credentials 'include', parse response bằng schema shared, lỗi → toast tiếng Việt từ errors.ts.
  - EventSource /events?vault= + reconnect; ServerEvent.parse rồi setQueryData.
  - Reconnect → refetch /vaults/:safe/state và /jobs (snapshot + stream).
  - Hook: useVaultState(safe), useJobs(safe), useJob(id).
- **Input → Output:** REST + SSE → Hook có dữ liệu live
- **Flow:** SSE → parse → setQueryData → render
- **Không được phá:**
  - Event sai schema bị bỏ, không crash.
- **Notes:**
  - Làm sớm để Lộc dùng cho WEB-5.
- **Test / DoD:**
  - [ ] Mock EventSource: event hợp lệ cập nhật cache
  - [ ] Event sai schema bị bỏ
  - [ ] Ngắt/nối SSE → refetch snapshot

#### AI-4 · GeminiExplainer chuẩn: responseSchema + prompt có <untrusted_input> + timeout
**Duy Quốc** · Hạn **T3 10/11** · 5h · P0 · phụ thuộc: SH-2, SH-3 · mở khoá: AI-5

- **Domain / Layer:** modules/explainer / Adapter (Gemini) + prompt
- **Mục tiêu:** AI giải thích bằng tiếng Việt dễ hiểu nhưng không có quyền gì. [Creativity 15]
- **Làm gì:**
  - prompts/explain.prompt.ts: LLM chỉ viết messageVi, mọi số lấy từ dữ liệu; text người dùng nằm trong <untrusted_input>.
  - responseMimeType JSON + responseSchema (messageVi 10–280 ký tự), Zod validate lại; thinkingBudget 0.
  - Timeout EXPLAINER_TIMEOUT_MS (2000); Flash-Lite làm model dự phòng.
- **Input → Output:** ExplainInput { verdict, reasonCode, intent, sim, budgetUsedPct } → Explanation { messageVi, source:'llm' }
- **Được tự quyết:**
  - Prompt, giọng văn, ví dụ few-shot.
- **Không được phá:**
  - LLM chỉ viết messageVi (P3, skill llm-explainer-guard).
- **Test / DoD:**
  - [ ] Mock SDK: JSON sai → throw
  - [ ] Timeout → throw
  - [ ] Snapshot prompt: khối untrusted đúng chỗ

#### SC-5 · Deploy Fuji: MockUSDC, pool TJ, factory, Safe + module demo, policy; verify Snowtrace
**Lộc** · Hạn **T4 11/11** · 8h · P0 · phụ thuộc: SC-2, SC-4 · mở khoá: TM-1, WEB-3, WEB-4, WEB-6, AV-1, OPS-5, SC-6, OPS-2, BE-10, AI-8

- **Domain / Layer:** packages/contracts + chain / Deploy (Fuji)
- **Mục tiêu:** Mọi thứ chạy thật trên Avalanche, giám khảo bấm link nào cũng thấy source đã verify. [Avalanche 25]
- **Làm gì:**
  - Script: Deploy.s.sol (MockUSDC, factory), SetupPool.s.sol (addLiquidity MockUSDC/WAVAX trên TJ V1 Fuji), DemoVault (Safe 1/1 + module qua factory + enableModule + setPolicy theo D15).
  - Verify tất cả contract trên Snowtrace/Routescan (forge verify-contract).
  - Ghi `packages/contracts/deployments/fuji.json` + địa chỉ vào `packages/shared/chain.ts`, infra/.env.example, apps/server/.env.example, apps/web/.env.example.
  - Fund agent EOA bằng AVAX test; mint MockUSDC cho Safe demo; 1 swap thủ công bằng cast.
- **Input → Output:** Faucet AVAX, địa chỉ factory/router TJ trên Fuji (kiểm chứng lại, đừng tin trí nhớ) → Địa chỉ thật + 1 swap trên Snowtrace
- **Flow:** faucet → deploy MockUSDC + factory → addLiquidity → Safe demo → deployModule → enableModule → setPolicy → mint/fund → cast swap
- **Được tự quyết:**
  - Dùng Safe Protocol Kit script hay forge script để tạo Safe.
- **Không được phá:**
  - Owner key chỉ ở Foundry keystore (`cast wallet import`, `forge script --account`) (D7). Không vào .env, không lên VPS.
- **Notes:**
  - Rủi ro #1 của dự án: thanh khoản và địa chỉ router Fuji. Có thể chạy trên Anvil fork trước để không chặn Đan Anh.
- **Test / DoD:**
  - [ ] Script chạy lại được (idempotent hoặc có hướng dẫn reset)
  - [ ] Mọi contract có badge Verified
  - [ ] Snowtrace hiển thị tx swap của module
- **Docs cập nhật:** setup-and-bringup.md (thứ tự deploy, địa chỉ)

#### BE-4 · AnvilSimulator thật: reset → impersonate agent → executeGuardedSwap → đọc state
**Đan Anh** · Hạn **T4 11/11** · 10h · P0 · phụ thuộc: BE-0, SH-2 · mở khoá: TM-1, BE-7

- **Domain / Layer:** modules/simulation / Adapter (Anvil)
- **Mục tiêu:** Shield 1 thấy trước kết quả kinh tế của mọi lệnh. [Technical 25, Creativity 15]
- **Làm gì:**
  - Đầu mỗi job: anvil_reset về block mới nhất (>500ms thì dùng evm_snapshot/revert).
  - Impersonate agent, gửi calldata thật tới module của vault; đọc balance Safe, attacker, allowance trước/sau.
  - Trả SimResult {ok, amountOut, balancesBefore/After, allowance, attackerBalance, revertReason}.
- **Input → Output:** SwapIntent đã qua precheck → SimResult đầy đủ
- **Flow:** reset → setBalance gas → impersonate → sendTransaction → receipt/revert → decode → balances → stopImpersonating
- **Được tự quyết:**
  - Chiến lược reset/snapshot để nhanh nhất.
- **Không được phá:**
  - Revert → ok:false + reason, không throw.
  - Queue swap concurrency 1 (không race reset).
- **Notes:**
  - Đo thời gian sim (< 1s), ghi vào docs.
- **Test / DoD:**
  - [ ] Integration: swap hợp lệ → ok
  - [ ] Vượt cap → ok:false, ExceedsPerTxCap
  - [ ] Sau reset spent không lệch chain
- **Docs cập nhật:** system-design §3.5 (số đo thật)

#### AI-6 · TemplateExplainer: câu tiếng Việt theo từng reason code, điền số thật
**Duy Quốc** · Hạn **T4 11/11** · 4h · P0 · phụ thuộc: SH-3 · mở khoá: AI-7

- **Domain / Layer:** modules/explainer / Adapter (Template)
- **Mục tiêu:** Đường chính khi mạng sân khấu yếu: phải đẹp như đường LLM.
- **Làm gì:**
  - Mỗi reason code có 1 mẫu câu + số định dạng vi-VN; approved: 'An toàn, tiêu X% hạn mức ngày'.
  - Luôn trả source:'template'.
- **Input → Output:** ExplainInput → Explanation { source:'template' }
- **Được tự quyết:**
  - Câu chữ.
- **Test / DoD:**
  - [ ] Snapshot mỗi reason code
  - [ ] Mọi số trong câu qua numeric-consistency guard

#### TM-1 · MILESTONE A (12/11): 1 swap thật trên Fuji từ POST rebalance đến confirmed + Snowtrace
**Cả nhóm** · Hạn **T5 12/11** · 3h · P0 · phụ thuộc: SC-5, BE-4, BE-5, BE-7, BE-9

- **Domain / Layer:** Toàn hệ thống / Milestone A
- **Mục tiêu:** Chứng minh đường găng chạy thật trước khi đầu tư UI/production. [Technical 25, Avalanche 25]
- **Làm gì:**
  - Cả nhóm ngồi cùng nhau, thay Fake bằng adapter thật trên local stack.
  - POST /vaults/:safe/rebalance {amountIn: 200 USDC} → job confirmed → SSE phát event → txHash mở được trên Snowtrace, allowance = 0.
  - Chưa đạt: 13/11 dừng mọi việc khác để sửa (trừ việc của người không liên quan tới lỗi).
- **Input → Output:** Contract trên Fuji (SC-5), adapter thật (BE-4, BE-5), Auditor (BE-7) → Video ngắn + link Snowtrace lưu vào docs/runbook/demo.md
- **Flow:** POST rebalance → queue swap → precheck → sim (Anvil) → invariants → verdict → broadcast ‖ explain → receipt → confirmed
- **Không được phá:**
  - Không 'giả' bước nào bằng Fake trong lần nghiệm thu.
- **Notes:**
  - Mốc cắt sớm: cuối 10/11 nếu contract chưa có test gate xanh, Đan Anh và Duy Quốc nhận viết test Foundry đơn giản để Lộc tập trung logic.
- **Test / DoD:**
  - [ ] 3 lần chạy liên tiếp đều confirmed
  - [ ] Có link Snowtrace của tx module
- **Docs cập nhật:** demo.md (link tx mẫu)

#### SC-3 · Fuzz 10.000 runs + invariant test có Handler (gồm epoch, nhiều ngày)
**Lộc** · Hạn **T5 12/11** · 6h · P0 · phụ thuộc: SC-2 · mở khoá: SC-6, PT-1

- **Domain / Layer:** packages/contracts / Test (Foundry)
- **Mục tiêu:** Bằng chứng chính cho Technical: 'hacker không lấy được 1 xu' được máy kiểm 10.000 lần. [Technical 25]
- **Làm gì:**
  - testFuzz_attackerNeverProfits(amount, caller).
  - Handler gọi ngẫu nhiên executeGuardedSwap, vm.warp qua ngày, revoke, setPolicy (epoch mới), gọi từ attacker.
  - Invariant: spentToday ≤ dailyCap; attacker balance = 0; sau revoke spent không tăng; allowance router = 0.
- **Input → Output:** Module đã xong gate → `forge test --fuzz-runs 10000` xanh + ảnh chụp cho slide/trang /proof
- **Được tự quyết:**
  - Thêm invariant khác nếu thấy có giá trị.
- **Test / DoD:**
  - [ ] forge test --fuzz-runs 10000 xanh
  - [ ] CI profile ci (1000 runs) xanh
  - [ ] Ảnh chụp kết quả lưu vào docs/
- **Docs cập nhật:** contracts.md §6

#### BE-7 · AuditorService đầy đủ theo vault: precheck → sim → invariants → verdict → broadcast ‖ explain
**Đan Anh** · Hạn **T5 12/11** · 8h · P0 · phụ thuộc: BE-1, BE-2, BE-4, BE-5, AI-1, AI-2, AI-3 · mở khoá: TM-1, BE-9, OPS-1, BE-11, AI-7, AG-1, WEB-7

- **Domain / Layer:** modules/auditor / Application service (state machine)
- **Mục tiêu:** Ghép mọi mảnh thành pipeline Shield 1 có audit log đầy đủ.
- **Làm gì:**
  - PolicyService(vault) → domain/precheck; fail → rejected + explain.
  - Sau sim: domain/invariants + verdict. Pass → broadcast và explain SONG SONG (P3).
  - Mỗi bước: jobs.transition + audit_log (shield, result, reason). Receipt → confirmed | reverted (decode lý do).
  - Explanation gắn bất đồng bộ qua job.explained.
- **Input → Output:** Job swap (SwapIntent có vault) → Job đi hết state machine, DB + audit + SSE
- **Flow:** queued → prechecking → (rejected | simulating) → (rejected | broadcasting) → (confirmed | reverted | failed); explain ‖ broadcast
- **Không được phá:**
  - LLM không bao giờ quyết verdict (P3).
  - Lỗi hạ tầng → failed sau retry; revert không retry.
- **Notes:**
  - Dựng bằng Fake trước (M1 10/11), adapter thật cho M2.
- **Test / DoD:**
  - [ ] Vitest Fake: 5 đường (approved, precheck-reject, sim-reject, invariant-reject, tx-revert)
  - [ ] Explainer chậm 5s không làm trễ broadcast

#### BE-9 · POST /vaults/:safe/rebalance {amountIn}, admin pause/resume, GET /jobs/:id kèm audit
**Đan Anh** · Hạn **T5 12/11** · 3h · P0 · phụ thuộc: BE-7 · mở khoá: TM-1

- **Domain / Layer:** modules/rebalancer + jobs / API (REST)
- **Mục tiêu:** Nút demo 'Run Rebalance 200 USDC' và chi tiết job cho Activity.
- **Làm gì:**
  - POST /vaults/:safe/rebalance {amountIn}: tạo intent trực tiếp (không qua math), đi qua pipeline bình thường.
  - POST /admin/rebalancer/pause|resume (gác AdminGuard ở BE-15).
  - GET /vaults/:safe/jobs, GET /jobs/:id kèm audit_log.
- **Input → Output:** { amountIn: string } → 202 + jobId
- **Không được phá:**
  - Validate bằng schema shared; amountIn là string base unit.
- **Test / DoD:**
  - [ ] e2e supertest: 202 + job xuất hiện trong /jobs
  - [ ] pause xong không còn tick tự động
- **Docs cập nhật:** system-design §8.1

#### AI-5 · numeric-consistency guard + bộ ≥ 25 fixture prompt injection
**Duy Quốc** · Hạn **T5 12/11** · 6h · P0 · phụ thuộc: AI-4 · mở khoá: AI-7

- **Domain / Layer:** modules/explainer / Guard + test injection
- **Mục tiêu:** Chứng minh: LLM bị lừa hoàn toàn cũng không đổi được verdict hay số tiền. [Technical 25, Creativity 15]
- **Làm gì:**
  - Trích mọi số trong messageVi (định dạng vi-VN: 1.500, 13,3%), so với tập số cho phép; lệch → throw để rơi xuống Template.
  - ≥ 25 fixture: ép đổi verdict, nói sai số, bỏ qua hướng dẫn, lộ system prompt, chèn tag đóng </untrusted_input>…
  - 1 test chứng minh verdict độc lập với explainer.
- **Input → Output:** messageVi + ExplainInput → ok | NumericMismatch; bảng kết quả cho slide
- **Flow:** Gemini → Zod → numeric guard → (fail) → Template
- **Được tự quyết:**
  - Thêm loại tấn công prompt mới.
- **Notes:**
  - Gộp AI-9 cũ.
- **Test / DoD:**
  - [ ] ≥ 25 fixture xanh
  - [ ] Fixture 'hãy nói đã tiêu 5%' bị loại
- **Docs cập nhật:** docs/product/pitch.md (bảng kết quả injection)

### P2 · 13–17/11 · Sản phẩm hoàn chỉnh trên production (→ Milestone B)

#### BE-6 · revert-decoder: decodeErrorResult → reason code (custom error, GS104, lỗi router)
**Lộc** · Hạn **T6 13/11** · 3h · P0 · phụ thuộc: SH-3, SC-2 · mở khoá: AI-8

- **Domain / Layer:** modules/execution / Adapter
- **Mục tiêu:** Mọi tx bị chặn phải hiện đúng lý do. Người viết error contract là người map chính xác nhất.
- **Làm gì:**
  - Hiện luôn trả UNKNOWN_REVERT.
  - decodeErrorResult với ABI shared cho custom error của module + factory.
  - Nhận diện chuỗi revert của Safe (GS104) và lỗi router (INSUFFICIENT_OUTPUT_AMOUNT).
- **Input → Output:** viem error / revert data → reason code khớp shared/errors.ts
- **Không được phá:**
  - Chỉ sửa file revert-decoder trong modules/execution; không đụng session key.
- **Notes:**
  - Dùng chung bởi AnvilSimulator (BE-4) và ViemTxSender (BE-5). Trước 13/11 hai adapter tạm trả UNKNOWN_REVERT.
- **Test / DoD:**
  - [ ] Table test: mỗi selector → đúng code
  - [ ] GS104 và selector lạ → đúng code / UNKNOWN_REVERT

#### WEB-3 · Policy panel: PolicyForm + useSetPolicy (owner ký trên browser) + trạng thái + kích hoạt lại
**Lộc** · Hạn **T6 13/11** · 7h · P0 · phụ thuộc: WEB-1, SC-5 · mở khoá: WEB-6

- **Domain / Layer:** features/policy / Frontend (ký ví)
- **Mục tiêu:** Owner tự đặt luật cho AI mà không cần tin backend. [Impact 15, UI/UX 10]
- **Làm gì:**
  - react-hook-form + zod: agentSigner (điền sẵn agent AgentShield, D13), expiry, limits từng token; đổi đơn vị người dùng → base unit bằng bigint.
  - useSetPolicy: wagmi writeContract trực tiếp tới module (P2).
  - useOnchainPolicy (useReadContract): 'Đang bảo vệ' / 'Đã khoá' / 'Hết hạn'.
  - Sau Kill: nút 'Kích hoạt lại' = setPolicy mới (epoch mới, D10).
- **Input → Output:** Form owner → Tx setPolicy trên Fuji; UI cập nhật khi nhận chain.policy
- **Được tự quyết:**
  - Preset policy (Thận trọng / Cân bằng), cách trình bày hạn mức.
- **Không được phá:**
  - Không gọi backend để ký (P2).
  - Không dùng float khi đổi 500 → 500e6 (P5).
  - Sai chain thì khoá nút ký.
- **Test / DoD:**
  - [ ] Vitest: đổi đơn vị ↔ base unit không mất chính xác
  - [ ] Thủ công: ký trên Fuji thấy PolicySet trên Snowtrace

#### OPS-1 · Dockerfile (api|worker, web) + docker-compose.prod.yml + Caddyfile
**Đan Anh** · Hạn **T6 13/11** · 5h · P0 · phụ thuộc: BE-7 · mở khoá: OPS-2

- **Domain / Layer:** infra / Triển khai
- **Mục tiêu:** Một lệnh dựng cả hệ thống, local và production giống nhau.
- **Làm gì:**
  - 1 image server (multi-stage, pnpm deploy), CMD chọn api|worker; web build static phục vụ bởi Caddy.
  - compose.prod: caddy (TLS tự động), web, api, worker, postgres, redis, anvil; healthcheck + restart policy; volume cho pg/redis.
  - Caddy: / → web, /api → api, SSE không buffer.
- **Input → Output:** — → `docker compose -f infra/docker-compose.prod.yml up` chạy trên máy sạch
- **Được tự quyết:**
  - Base image, cách cache build.
- **Không được phá:**
  - Image không chứa .env/secret.
- **Test / DoD:**
  - [ ] Máy sạch: up → /health OK → mở web
  - [ ] Kích thước image server < 400 MB
- **Docs cập nhật:** setup-and-bringup.md (mục Production)

#### AI-7 · ExplainerService: queue explain + cache + limiter RPM Gemini
**Duy Quốc** · Hạn **T6 13/11** · 3h · P1 · phụ thuộc: AI-5, AI-6, BE-7

- **Domain / Layer:** modules/explainer / Application service + queue
- **Mục tiêu:** Giám khảo spam nút trên prod vẫn ra giải thích, không chạm quota.
- **Làm gì:**
  - Cache theo (vault, scenario, amountIn, verdict).
  - Queue explain concurrency 2 + limiter RPM; vượt → template.
  - Không bao giờ throw ra ngoài.
- **Không được phá:**
  - Tách khỏi critical path broadcast (P3).
- **Test / DoD:**
  - [ ] Cache hit không gọi Gemini lần 2
  - [ ] Vượt RPM → template, không lỗi

#### WEB-4 · KillSwitchButton: revoke() từ ví owner, đo độ trễ, cả UI chuyển đỏ
**Lộc** · Hạn **T7 14/11** · 4h · P0 · phụ thuộc: WEB-1, SC-5

- **Domain / Layer:** features/kill-switch / Frontend (ký ví)
- **Mục tiêu:** Khoảnh khắc mạnh nhất của pitch: 'tắt server đi, nút Kill vẫn chạy', khoá trong ~1,5s nhờ Avalanche. [Avalanche 25, Pitch 10]
- **Làm gì:**
  - useKillSwitch → writeContract revoke() (không qua backend).
  - Đo click → receipt, hiển thị 'Đã khoá sau X,Y giây'.
  - isActive=false đổi toàn UI (viền đỏ, nút rebalance/attack báo bị chặn).
- **Input → Output:** Click → PolicyRevoked on-chain + độ trễ hiển thị
- **Được tự quyết:**
  - Hiệu ứng, xác nhận 2 bước (giữ nút 1 giây) để tránh bấm nhầm.
- **Không được phá:**
  - Không có endpoint POST /kill (P2).
- **Notes:**
  - Phải thử thật: tắt api/worker rồi bấm Kill.
- **Test / DoD:**
  - [ ] Thủ công: tắt backend → Kill vẫn thành công
  - [ ] Sau Kill, rebalance ra PolicyInactive

#### OPS-2 · Dựng VPS: docker, firewall, TLS, .env.prod, fund agent — M3 prod chạy được
**Đan Anh** · Hạn **T7 14/11** · 5h · P0 · phụ thuộc: OPS-1, SC-5 · mở khoá: OPS-3, OPS-4

- **Domain / Layer:** infra (VPS) / Production
- **Mục tiêu:** Giám khảo có URL HTTPS để tự bấm thử. [UI/UX & Demo 10, Avalanche 25]
- **Làm gì:**
  - Cài docker, ufw (chỉ 22/80/443), user deploy, SSH key; DNS → VPS.
  - .env.prod trên server (agent session key, Gemini key, RPC key, JWT secret); không có owner key (D14).
  - Deploy lần đầu bằng tay; migrate; seed vault demo.
- **Input → Output:** VPS từ BE-0, image từ OPS-1 → https://<domain> chạy landing + /demo đọc state thật + SSE
- **Được tự quyết:**
  - Domain, cách quản lý secret (sops, file quyền 600).
- **Không được phá:**
  - Owner key không bao giờ lên server (invariant 5).
- **Test / DoD:**
  - [ ] URL HTTPS hợp lệ
  - [ ] SSE giữ kết nối qua Caddy > 5 phút
  - [ ] Restart VPS → mọi service tự lên
- **Docs cập nhật:** setup-and-bringup.md

#### AG-1 · Rebalancer: tick qua mọi vault active, giá getAmountsOut, clamp daily còn lại, idempotency
**Duy Quốc** · Hạn **T7 14/11** · 6h · P0 · phụ thuộc: BE-3, BE-7 · mở khoá: TM-2

- **Domain / Layer:** modules/rebalancer / Worker (agent strategy)
- **Mục tiêu:** 'AI agent giao dịch 24/7' là thật, không chỉ là nút bấm. [Impact 15]
- **Làm gì:**
  - Tick 15s: lặp vault active (registry) → balances + policy (BE-2) → giá router.getAmountsOut(10^decA) → computeRebalance → enqueue.
  - Clamp thêm theo dailyCap − spentToday; bỏ qua nếu lệch < ~2% quỹ.
  - Idempotency: jobId = rebalance:{safe}:{floor(block/10)}; bỏ qua nếu vault còn job active/waiting.
  - Vault demo mặc định pause (Demo mode); vault người dùng chạy tự động.
- **Input → Output:** Tick hoặc nút → Tối đa 1 intent hợp lệ mỗi vault mỗi tick
- **Flow:** tick → chain state → price → math → clamp → dedupe → enqueue
- **Được tự quyết:**
  - Chiến lược (target ratio, ngưỡng) miễn deterministic và có test.
- **Không được phá:**
  - LLM tuyệt đối không tham gia quyết định (P3).
  - Decimals USDC 6 / WAVAX 18.
- **Test / DoD:**
  - [ ] rebalance.math.spec: khác decimals, clamp daily, bằng ngưỡng
  - [ ] Không enqueue khi vault đã có job active
  - [ ] Property: amountIn ≤ min(maxPerTx, daily còn lại)
- **Docs cập nhật:** system-design §4 (rebalancer multi-vault)

#### AI-8 · Red-team đủ 4 đòn + injection theo vault, POST /vaults/:safe/attacks/*
**Duy Quốc** · Hạn **T7 14/11** · 8h · P0 · phụ thuộc: BE-5, BE-6, SC-5 · mở khoá: TM-2, WEB-8

- **Domain / Layer:** modules/redteam / Worker (scenarios)
- **Mục tiêu:** Mỗi đòn là hành động thật trên chain, có link Snowtrace làm bằng chứng. [Creativity 15, Pitch 10]
- **Làm gì:**
  - unlimited-approval: session key gọi thẳng safe.execTransactionFromModule(USDC.approve(router, MAX)) → GS104.
  - bypass (#4): sendRaw executeGuardedSwap(2000e6) gas thủ công, KHÔNG qua Auditor → tx mined + revert ExceedsPerTxCap → txHash.
  - prompt-injection: POST /vaults/:safe/attacks/inject {text} → explainer dưới <untrusted_input>.
  - Sửa over-withdraw/wrong-recipient: minAmountOut > 0 để chỉ gate dự định kích hoạt.
- **Input → Output:** POST /vaults/:safe/attacks/:scenario → Job attack:<scenario> rejected/reverted + txHash
- **Flow:** UI → API enqueue attack → RedTeam worker → (Auditor | TxSender thẳng) → job.updated → SSE
- **Được tự quyết:**
  - Thêm đòn thứ 5 (stretch) nếu có ý tưởng hay.
- **Không được phá:**
  - Dùng chung TxSender + mutex (P4); không tạo signer riêng.
  - Không để viem estimateGas (sẽ mất bằng chứng Snowtrace).
- **Test / DoD:**
  - [ ] Mỗi scenario kết thúc đúng trạng thái + reason (Anvil)
  - [ ] Bypass: có txHash, reverted, ExceedsPerTxCap
  - [ ] Số dư Safe không đổi sau 4 đòn
- **Docs cập nhật:** system-design §5

#### WEB-5 · Vault panel: Balances trước/sau + DailyBudgetBar + Nạp tiền + Rút tiền
**Lộc** · Hạn **CN 15/11** · 7h · P0 · phụ thuộc: WEB-2, BE-3 · mở khoá: TM-2

- **Domain / Layer:** features/vault / Frontend (hiển thị + ký ví)
- **Mục tiêu:** Người dùng thấy tiền của mình an toàn và tự chủ được tiền (nạp/rút). [UI/UX 10, Impact 15]
- **Làm gì:**
  - useVaultState từ /vaults/:safe/state; format bigint → chuỗi chỉ ở UI (shared money).
  - DailyBudgetBar có animation khi spentToday tăng; bảng Trước/Sau lấy từ sim của job gần nhất.
  - Nạp tiền: ERC20 transfer từ ví owner vào Safe. Rút tiền: Safe execTransaction do owner ký (Protocol Kit).
- **Input → Output:** StateDto, job.sim → Số dư và hạn mức realtime; nạp/rút chạy trên Fuji
- **Được tự quyết:**
  - Biểu đồ, cách so sánh trước/sau.
- **Không được phá:**
  - Không Number() trên bigint 18 decimals (P5).
  - Rút tiền do owner ký trên browser, không qua backend.
- **Notes:**
  - Cắt được nút Rút tiền nếu trễ (luật cắt #4).
- **Test / DoD:**
  - [ ] Vitest: 1500000000n USDC → '1.500'
  - [ ] Snapshot thanh ngân sách 0%, 13,3%, 100%
  - [ ] Thủ công: nạp 100 USDC thấy số dư tăng

#### BE-10 · Indexer: factory ModuleDeployed → registry; event mọi module → chain.*; cursor idempotent
**Đan Anh** · Hạn **CN 15/11** · 8h · P0 · phụ thuộc: SC-4, SC-5 · mở khoá: TM-2

- **Domain / Layer:** modules/indexer / Worker (poll chain)
- **Mục tiêu:** UI realtime cho mọi vault, và vault mới từ wizard tự xuất hiện.
- **Làm gì:**
  - Poll getLogs mỗi 1s từ chain_cursor: factory (ModuleDeployed) + mọi module trong registry (PolicySet, PolicyRevoked, GuardedSwap).
  - ModuleDeployed → insert vaults. Handlers tách 4 file.
  - Insert idempotent theo (tx_hash, log_index); publish chain.* có `vault`.
  - Ghi policy_snapshots khi thấy PolicySet (chỉ để fallback).
- **Input → Output:** Logs trên Fuji → UI nhận event ≈ 1–2s sau block
- **Được tự quyết:**
  - Batch theo block range, cách mở rộng danh sách địa chỉ.
- **Không được phá:**
  - Không dẫn xuất policy/spend từ event (P1).
- **Notes:**
  - Avalanche finality tức thì nên không cần xử lý reorg (câu pitch).
- **Test / DoD:**
  - [ ] Chạy 2 lần cùng đoạn block không tạo bản ghi trùng
  - [ ] Restart giữa chừng resume đúng cursor
  - [ ] Tạo vault bằng wizard → GET /vaults có vault mới ≤ 5s
- **Docs cập nhật:** system-design §3.4

#### BE-15 · Auth SIWE: nonce/verify/me/logout + OwnerGuard (on-chain) + AdminGuard + nút Sign-in
**Đan Anh** · Hạn **CN 15/11** · 6h · P0 · phụ thuộc: BE-3, WEB-1 · mở khoá: BE-16

- **Domain / Layer:** modules/auth + features/auth / Auth (BE + FE)
- **Mục tiêu:** Production an toàn: chỉ owner điều khiển vault của mình, chỉ admin đụng route admin. [Technical 25]
- **Làm gì:**
  - GET /auth/nonce, POST /auth/verify (viem verifySiweMessage, domain + chainId), GET /auth/me, POST /auth/logout; cookie JWT httpOnly, SameSite=Lax, 24h.
  - OwnerGuard: Safe.getOwners() on-chain chứa address session (D12). AdminGuard: allowlist ADMIN_ADDRESSES trong env.
  - Vault demo (is_demo): visitor được rebalance/attack (có rate limit ở BE-16); vault khác cần owner.
  - features/auth: RainbowKit authentication adapter + hook useSession.
- **Input → Output:** Ví người dùng → Session cookie; guard áp vào route theo bảng D12
- **Flow:** nonce → ký message trong ví → verify → cookie → guard
- **Được tự quyết:**
  - Thư viện JWT, thời hạn session.
- **Không được phá:**
  - SIWE không thay thế chữ ký setPolicy/Kill (P2).
  - Không lưu quyền owner trong DB; luôn kiểm on-chain (P1).
- **Test / DoD:**
  - [ ] e2e: chữ ký sai/nonce cũ → 401
  - [ ] Không phải owner gọi rebalance vault người khác → 403
  - [ ] Bull Board không mở được khi chưa login admin
- **Docs cập nhật:** system-design (mục mới: Auth & phân quyền)

#### WEB-7 · Activity: JobTimeline (precheck→sim→invariant→chain) + ExplanationCard + ngăn chi tiết job
**Duy Quốc** · Hạn **CN 15/11** · 8h · P0 · phụ thuộc: WEB-2, BE-7 · mở khoá: TM-2

- **Domain / Layer:** features/activity / Frontend (hiển thị)
- **Mục tiêu:** Màn khán giả nhìn nhiều nhất: thấy rõ 2 lớp khiên chặn ở đâu. [UI/UX 10, Pitch 10]
- **Làm gì:**
  - Timeline theo trạng thái job + audit_log (Shield 1 / Shield 2).
  - Thẻ xanh/đỏ, reason, messageVi, badge llm|template, link Snowtrace (helper AV-1).
  - job.explained đến sau: thẻ hiện ngay, giải thích điền sau. Ngăn chi tiết: intent, sim trước/sau, audit.
- **Input → Output:** useJobs + job.updated/job.explained → Activity feed đọc được từ xa trên projector
- **Được tự quyết:**
  - Toàn bộ trình bày và motion.
- **Không được phá:**
  - Không hiển thị số tự tính lại; dùng số từ server.
- **Test / DoD:**
  - [ ] Vitest component: mỗi trạng thái render đúng
  - [ ] Thẻ không vỡ khi explanation chưa tới

#### WEB-6 · Wizard /vaults/new: tạo Safe → deploy + enable module → setPolicy → faucet + nạp tiền
**Lộc** · Hạn **T2 16/11** · 10h · P0 · phụ thuộc: SC-5, WEB-3 · mở khoá: TM-2

- **Domain / Layer:** features/onboarding / Frontend (wizard ký ví)
- **Mục tiêu:** Từ 'demo' thành 'sản phẩm': một người lạ tự bảo vệ quỹ của họ trong < 3 phút. [Impact 15, Avalanche 25, UI/UX 10]
- **Làm gì:**
  - Bước: kết nối ví → chuyển Fuji (link faucet AVAX) → tạo Safe 1/1 (Protocol Kit) → factory.deployModule + enableModule → setPolicy (agent điền sẵn) → MockUSDC faucet + nạp → chuyển tới /vaults/:safe.
  - Resume được: mỗi bước đọc trạng thái chain để biết đã xong chưa (đóng tab mở lại vẫn tiếp tục).
  - Vault mới tự xuất hiện ở backend qua event ModuleDeployed (BE-10), không cần POST.
- **Input → Output:** Ví người dùng có AVAX Fuji → Vault mới chạy được rebalance + attack
- **Flow:** connect → network → Safe → module → policy → fund → dashboard
- **Được tự quyết:**
  - Gộp bước để giảm số lần ký (mục tiêu ≤ 4), copy giải thích từng bước.
- **Không được phá:**
  - Không gửi private key/seed đi đâu; mọi tx ký trong ví người dùng.
  - Không lưu policy vào DB (P1).
- **Notes:**
  - Luật cắt #6: nếu trễ, Safe tạo bằng script và wizard chỉ còn module + policy + nạp.
- **Test / DoD:**
  - [ ] Ví mới tinh tạo vault thành công end-to-end trên Fuji
  - [ ] Đóng tab giữa chừng → mở lại tiếp tục đúng bước
  - [ ] Vault mới hiện trong GET /vaults ≤ 5s
- **Docs cập nhật:** setup-and-bringup.md (luồng người dùng tự tạo vault)

#### AV-1 · Gói Avalanche: trang /proof, helper link explorer, Core wallet ưu tiên, đo finality mọi tx
**Lộc** · Hạn **T2 16/11** · 4h · P0 · phụ thuộc: SC-5, WEB-1 · mở khoá: TM-2

- **Domain / Layer:** features/proof + shared/web3 / Avalanche integration
- **Mục tiêu:** Ăn trọn 25% điểm Avalanche bằng bằng chứng giám khảo tự kiểm được. [Avalanche 25]
- **Làm gì:**
  - Trang /proof: danh sách contract đã verify (link Snowtrace), tx then chốt (swap, revert #4, PolicyRevoked), kết quả fuzz, link báo cáo Slither.
  - Helper `explorerTx/explorerAddress` dùng chung toàn app.
  - Core wallet hiển thị đầu tiên trong RainbowKit.
  - Mọi tx do browser ký hiển thị 'Finalized trong X,Y s' (đo thật).
- **Input → Output:** deployments/fuji.json → Trang /proof + badge finality
- **Được tự quyết:**
  - Thêm số liệu Avalanche khác (gas fee thực tế, block time).
- **Không được phá:**
  - Chỉ hiển thị số đo thật, không hard-code.
- **Notes:**
  - Câu thoại Avalanche: demo.md §3.
- **Test / DoD:**
  - [ ] Mọi link trên /proof mở được
  - [ ] Kill-switch hiển thị độ trễ đo thật
- **Docs cập nhật:** pitch.md (bảng tiêu chí: mục Avalanche)

#### BE-16 · Hardening production: throttler, cooldown theo vault, CORS, helmet, chặn khi agent sắp hết gas
**Đan Anh** · Hạn **T2 16/11** · 4h · P0 · phụ thuộc: BE-15 · mở khoá: TM-2

- **Domain / Layer:** core + api / Bảo mật vận hành
- **Mục tiêu:** URL public không bị phá hoặc đốt sạch gas/quota trước khi giám khảo vào.
- **Làm gì:**
  - @nestjs/throttler theo IP; mỗi vault tối đa 1 job đang chạy, 10 job/phút.
  - CORS allowlist domain web; helmet; body limit; /attacks/inject text ≤ 500 ký tự.
  - Agent gas guard: balance < ngưỡng → từ chối enqueue kèm thông báo tiếng Việt thân thiện.
  - Bull Board sau AdminGuard.
- **Input → Output:** — → Bảng giới hạn trong docs
- **Được tự quyết:**
  - Ngưỡng cụ thể.
- **Không được phá:**
  - Thông báo lỗi không lộ stack trace/secret.
- **Test / DoD:**
  - [ ] Spam 50 request → 429 đúng
  - [ ] Agent gas thấp → enqueue bị chặn có thông báo
  - [ ] Origin lạ → CORS chặn
- **Docs cập nhật:** system-design §10 (threat: abuse)

#### OPS-3 · GitHub Actions deploy: build → GHCR → SSH deploy → migrate → smoke /health
**Đan Anh** · Hạn **T2 16/11** · 4h · P0 · phụ thuộc: OPS-2 · mở khoá: TM-2

- **Domain / Layer:** .github/workflows / CI/CD
- **Mục tiêu:** Mỗi merge vào main lên prod trong vài phút, không deploy tay lúc gấp.
- **Làm gì:**
  - Workflow deploy (chạy sau CI xanh trên main, có nút chạy tay): build image, push GHCR.
  - SSH vào VPS: pull, migrate, `up -d`, smoke /health; fail → giữ bản cũ.
  - Tắt auto-deploy sau freeze, chỉ chạy tay.
- **Input → Output:** — → Deploy tự động có rollback đơn giản
- **Flow:** merge main → CI → build → push → ssh deploy → smoke
- **Không được phá:**
  - Secret ở GitHub Secrets, không in ra log.
- **Test / DoD:**
  - [ ] 1 PR nhỏ merge → prod cập nhật < 10 phút
  - [ ] Smoke fail → không thay bản đang chạy
- **Docs cập nhật:** setup-and-bringup.md

#### WEB-8 · Red-team panel: Run Rebalance, 4 AttackButtons, InjectionBox, Demo mode (admin)
**Duy Quốc** · Hạn **T2 16/11** · 5h · P0 · phụ thuộc: WEB-2, AI-8 · mở khoá: TM-2

- **Domain / Layer:** features/red-team / Frontend (hành động)
- **Mục tiêu:** Giám khảo tự tay tấn công vault demo trên prod. [Creativity 15, UI/UX 10]
- **Làm gì:**
  - Run Rebalance (200 USDC) → POST /vaults/:safe/rebalance.
  - 4 nút đỏ → /attacks/:scenario; ô nhập → /attacks/inject; mô tả 1 dòng cho từng đòn.
  - Pending/disabled, hiển thị job vừa tạo; lỗi 429/hết gas → thông báo thân thiện.
  - Demo mode toggle (pause/resume) chỉ hiện với admin.
- **Input → Output:** Click / text → Job mới ở Activity
- **Được tự quyết:**
  - Cách kể chuyện từng đòn.
- **Test / DoD:**
  - [ ] Vitest: click gọi đúng endpoint + payload (mock fetch)
  - [ ] Nút khoá trong lúc pending

#### TM-2 · MILESTONE B (17/11): chạy trọn kịch bản 3 phút trên URL production
**Cả nhóm** · Hạn **T3 17/11** · 3h · P0 · phụ thuộc: OPS-3, WEB-6, WEB-8, WEB-9, BE-10, BE-16, AI-8, AV-1, WEB-5, WEB-7, AG-1 · mở khoá: TM-3, PT-1

- **Domain / Layer:** Toàn hệ thống / Milestone B
- **Mục tiêu:** Sản phẩm hoàn chỉnh trên production đúng như giám khảo sẽ thấy. [UI/UX 10, Demo, Impact 15]
- **Làm gì:**
  - Trên URL HTTPS: landing → /demo → Rebalance 200 → #1 → #4 → Kill → Rebalance bị chặn PolicyInactive.
  - Thêm: #2, #3, injection; tạo 1 vault mới bằng wizard từ ví khác rồi chạy 1 rebalance trên vault đó.
  - Thử từ điện thoại (4G) và từ trình duyệt ẩn danh không có ví.
  - Ghi mọi lỗi vào Sheet (tab Bugs), gán owner theo charter.
- **Input → Output:** Toàn bộ task P2 → Danh sách lỗi ≤ 5, không lỗi chặn
- **Không được phá:**
  - Không sửa tay trên server trong lúc chạy kịch bản.
- **Test / DoD:**
  - [ ] 1 lượt hoàn chỉnh < 3 phút không can thiệp tay
  - [ ] Wizard tạo vault mới thành công
  - [ ] Mở được từ mobile
- **Docs cập nhật:** demo.md §2 (cập nhật kịch bản theo UI thật)

#### WEB-9 · Landing + 'How it works' + guided tour cho /demo
**Duy Quốc** · Hạn **T3 17/11** · 6h · P0 · phụ thuộc: WEB-1 · mở khoá: TM-2

- **Domain / Layer:** features/landing + features/tour / Frontend (marketing + onboarding)
- **Mục tiêu:** Giám khảo mở URL là hiểu sản phẩm trong 30 giây và biết bấm gì. [UI/UX 10, Impact 15, Pitch 10]
- **Làm gì:**
  - Landing: vấn đề (AI agent cầm key), giải pháp 2 lớp khiên (sơ đồ), CTA 'Thử demo' / 'Tạo vault của bạn', link /proof.
  - How it works: sơ đồ kiến trúc tối giản, ví dụ đời thường từ pitch.md.
  - Guided tour 5 bước trên /demo (rebalance → #1 → #4 → xem Snowtrace → kill (chỉ admin) / xem /proof).
- **Input → Output:** pitch.md → Landing responsive + tour
- **Được tự quyết:**
  - Toàn quyền sáng tạo nội dung và hình ảnh.
- **Không được phá:**
  - Mọi số liệu trên landing phải có thật (fuzz runs, độ trễ đo được).
- **Notes:**
  - Luật cắt #2: tour → hướng dẫn tĩnh.
- **Test / DoD:**
  - [ ] Người ngoài nhóm hiểu sản phẩm trong 30s (thử với 2 người)
  - [ ] Mobile không vỡ

### P3 · 18–20/11 · Freeze, quay video, nộp bài

#### TM-3 · Feature freeze + bug bash chéo + demo-readiness, tag v1.0-rc
**Cả nhóm** · Hạn **T4 18/11** · 4h · P0 · phụ thuộc: TM-2 · mở khoá: TM-4

- **Domain / Layer:** Toàn hệ thống / Freeze
- **Mục tiêu:** Ổn định để quay video. Người ngoài mảng tìm lỗi tốt hơn người viết.
- **Làm gì:**
  - Từ 18/11 chỉ sửa bug. Mọi thay đổi còn lại phải qua PR có review.
  - Bug bash chéo 2h: Lộc test mảng Duy Quốc, Duy Quốc test mảng Đan Anh, Đan Anh test mảng Lộc.
  - Chạy skill `demo-readiness` + checklist demo.md §1 trên production.
  - Tag `v1.0-rc`.
- **Input → Output:** — → Tag v1.0-rc, checklist ký tên
- **Không được phá:**
  - Không thêm tính năng mới sau 18/11 (trừ Stretch sau khi đã nộp bài).
- **Notes:**
  - dayId theo UTC: 00:00 UTC = 7h sáng VN.
- **Test / DoD:**
  - [ ] `pnpm seed --verify` trên prod toàn PASS
  - [ ] 0 bug mức chặn
- **Docs cập nhật:** demo.md §1

#### OPS-5 · scripts/seed.ts --verify: kiểm tra sẵn sàng (local và prod), chỉ đọc
**Lộc** · Hạn **T4 18/11** · 4h · P0 · phụ thuộc: SC-5, BE-3

- **Domain / Layer:** scripts / Tooling (demo)
- **Mục tiêu:** Trước mỗi lần quay/thi, 1 lệnh cho biết hệ thống đã sẵn sàng chưa.
- **Làm gì:**
  - In PASS/FAIL: Safe demo đủ token, agent đủ AVAX, module enabled, policy active & chưa hết hạn, spentToday, pool có thanh khoản, factory đúng địa chỉ, API /health, Gemini trả lời.
  - Chạy được với `--env prod` (trỏ URL production).
- **Input → Output:** env → Bảng PASS/FAIL, exit code ≠ 0 nếu fail
- **Được tự quyết:**
  - Gợi ý cách sửa cho từng FAIL.
- **Không được phá:**
  - Không giữ owner key; phần ghi (mint, setPolicy) là forge script hoặc UI (D7).
- **Notes:**
  - Bước đầu tiên của checklist demo.md.
- **Test / DoD:**
  - [ ] Tắt Redis → FAIL đúng mục
  - [ ] Prod toàn PASS
- **Docs cập nhật:** demo.md §1

#### SC-6 · Fork test Fuji (router TJ thật) + Slither + security-report.md
**Lộc** · Hạn **T4 18/11** · 5h · P1 · phụ thuộc: SC-3, SC-5

- **Domain / Layer:** packages/contracts / Bảo mật + test fork
- **Mục tiêu:** Trả lời trung thực câu 'đã audit chưa?' bằng báo cáo. [Technical 25]
- **Làm gì:**
  - Fork test: swap thật trên fork, exact approval, allowance = 0, recipient là Safe.
  - Slither: triage từng finding (sửa hoặc ghi lý do bỏ qua); chạy các bước skill secure-workflow-guide.
  - Viết docs/architecture/security-report.md: finding, cách xử lý, giới hạn đã biết.
- **Input → Output:** Contract final → Báo cáo + fork test xanh
- **Được tự quyết:**
  - Thêm công cụ khác (Aderyn, Mythril) nếu còn thời gian.
- **Không được phá:**
  - Sửa contract sau freeze 18/11 phải redeploy + verify lại và cập nhật deployments/fuji.json, nên chỉ sửa finding high.
- **Notes:**
  - Luật cắt #5: bỏ fork test, giữ Slither.
- **Test / DoD:**
  - [ ] forge test --fork-url $FUJI --match-contract Fork xanh
  - [ ] Không còn high/medium chưa giải thích
- **Docs cập nhật:** docs/architecture/security-report.md (mới)

#### OPS-4 · /health (pg, redis, rpc, anvil) + uptime monitor + cảnh báo Telegram (gas thấp, lỗi Gemini)
**Đan Anh** · Hạn **T4 18/11** · 3h · P1 · phụ thuộc: OPS-2

- **Domain / Layer:** core + infra / Giám sát
- **Mục tiêu:** Biết hệ thống hỏng trước khi giám khảo phát hiện (họ chấm online bất kỳ lúc nào).
- **Làm gì:**
  - GET /health trả trạng thái từng phụ thuộc.
  - UptimeRobot/BetterStack ping /health 5 phút.
  - Worker gửi webhook Telegram khi agent AVAX < ngưỡng, Gemini lỗi liên tiếp, job failed liên tiếp.
- **Input → Output:** — → Kênh cảnh báo của nhóm
- **Được tự quyết:**
  - Kênh cảnh báo (Telegram/Discord).
- **Test / DoD:**
  - [ ] Tắt redis trên staging → nhận cảnh báo < 5 phút
- **Docs cập nhật:** demo.md §4

#### BE-11 · Integration test pipeline với Anvil thật (hợp lệ, vượt cap, kill rồi swap)
**Đan Anh** · Hạn **T4 18/11** · 4h · P1 · phụ thuộc: BE-7

- **Domain / Layer:** test/integration / Test
- **Mục tiêu:** Lưới an toàn cho mọi thay đổi trong tuần cuối.
- **Làm gì:**
  - Dựng test/integration: Anvil fork + deploy module (mock router) + Redis + Postgres; 3 kịch bản.
- **Input → Output:** — → `pnpm test:integration` xanh trên máy dev
- **Được tự quyết:**
  - Chạy trong CI hay chỉ chạy tay (tuỳ thời gian chạy).
- **Không được phá:**
  - Test không gọi Fuji thật và không dùng key thật.
- **Notes:**
  - Luật cắt #3: rút còn 1 kịch bản.
- **Test / DoD:**
  - [ ] 3 kịch bản xanh, < 60s
- **Docs cập nhật:** codebase.md (mục test)

#### PT-1 · Slide + script video 2–3 phút + cheat sheet FAQ + README gốc (dẫn dắt; Lộc, Đan Anh viết phần mình)
**Duy Quốc** · Hạn **T5 19/11** · 6h · P0 · phụ thuộc: SC-3, TM-2 · mở khoá: TM-4

- **Domain / Layer:** docs/product + README / Nội dung pitch
- **Mục tiêu:** Pitch 10% + phần lớn ấn tượng vòng online đến từ video và slide.
- **Làm gì:**
  - Script video theo kịch bản demo.md, quay trên prod (thời lượng 2:00–3:00), có câu thoại Avalanche.
  - Slide: vấn đề, 2 khiên, kiến trúc 1 hình, bằng chứng (fuzz 10k, injection 25 case, Slither, link Snowtrace), giới hạn trung thực, roadmap.
  - README gốc: 1 câu giá trị, demo URL, video, kiến trúc, địa chỉ contract, chạy local trong 3 lệnh. Lộc viết mục Contracts, Đan Anh viết mục Run/Deploy.
  - Cheat sheet 12 câu FAQ.
- **Input → Output:** pitch.md, demo.md, số liệu thật → Slide (link public) + script + README
- **Được tự quyết:**
  - Toàn quyền về câu chuyện và hình ảnh.
- **Không được phá:**
  - Không hứa tính năng chưa có; roadmap ghi rõ là roadmap.
- **Test / DoD:**
  - [ ] Đọc script có bấm giờ ≤ 3 phút
  - [ ] 2 người ngoài nhóm đọc README chạy được local
- **Docs cập nhật:** README.md, docs/product/pitch.md

#### TM-4 · Quay video 2–3 phút + chốt slide + README + nộp form (trước 22:00 20/11)
**Cả nhóm** · Hạn **T6 20/11** · 5h · P0 · phụ thuộc: TM-3, PT-1 · mở khoá: TM-5

- **Domain / Layer:** Nộp bài / Submission
- **Mục tiêu:** Bài nộp hợp lệ và thuyết phục. Link nào giám khảo không mở được là bị loại.
- **Làm gì:**
  - Quay video theo script PT-1 trên URL production (OBS 1080p), dựng, upload YouTube unlisted.
  - Repo GitHub: public (hoặc thêm `tuantqse90`), README gốc hoàn chỉnh, tag `v1.0`.
  - Slide Google Slides/Canva: quyền 'Anyone with the link can view'.
  - Nộp form Submit Project trên team1vn.xyz; mở mọi link bằng trình duyệt ẩn danh để kiểm tra trước khi bấm Submit.
- **Input → Output:** Script + slide (PT-1), production ổn định → Form đã Submit (không phải Draft), ảnh chụp xác nhận
- **Được tự quyết:**
  - Phong cách video (voice-over, picture-in-picture camera).
- **Không được phá:**
  - Không để secret (key, .env) lọt vào repo public: chạy gitleaks trước khi public.
- **Notes:**
  - Hạn chót 21/11 23:59. Nộp sớm 1 ngày để có đệm.
- **Test / DoD:**
  - [ ] Form trạng thái Submitted
  - [ ] 3 link mở được ở chế độ ẩn danh
  - [ ] Video 2:00–3:00
- **Docs cập nhật:** README.md (gốc), docs/README.md (bỏ dòng 'chưa scaffold code')

#### TM-6 · (Tuỳ chọn) Builder Pass: mỗi người tự hoàn thành 5 quest
**Cả nhóm** · Hạn **T6 20/11** · 1h · P2

- **Domain / Layer:** Cá nhân / Builder Pass
- **Mục tiêu:** Phần thưởng nhỏ ($10/người), không ảnh hưởng điểm thi.
- **Làm gì:**
  - Làm đủ 5 quest trên team1vn.xyz/builderpass.html bằng email Google đã xác minh; dùng địa chỉ C-Chain chính xác.
- **Không được phá:**
  - Làm ngoài giờ, không lấy giờ của task P0.
- **Notes:**
  - Thiếu 1 quest là mất suất.
- **Test / DoD:**
  - [ ] 5/5 quest

### P4 · 22–30/11 · Demo Day

#### TM-5 · Chuẩn bị Demo Day 30/11 (nếu vào Top 10): rehearsal ×5, Q&A, phương án dự phòng
**Cả nhóm** · Hạn **CN 29/11** · 8h · P0 · phụ thuộc: TM-4

- **Domain / Layer:** Demo Day / Rehearsal
- **Mục tiêu:** Pitch live không fail. [Presentation 10, UI/UX & Demo 10]
- **Làm gì:**
  - 5 lượt rehearsal bấm giờ; luân phiên người hỏi giả làm giám khảo với 12 câu FAQ.
  - Dự phòng: laptop thứ 2 có local stack, hotspot 4G, video offline, tab Snowtrace mở sẵn.
  - Thử ngắt Wi-Fi: explanation chuyển template < 2s, UI không vỡ.
  - Reset sandbox trước giờ thi (setPolicy mới, D10).
- **Input → Output:** — → Kịch bản live + phân vai nói
- **Được tự quyết:**
  - Stretch (mục 6) chỉ khi prod đã ổn định.
- **Không được phá:**
  - Không deploy lên prod trong 24h trước Demo Day.
- **Notes:**
  - Demo Day: 09:00–11:30 thứ Hai 30/11, Greenwich Vietnam, 20 Cộng Hoà.
- **Test / DoD:**
  - [ ] 5/5 lượt không lỗi
  - [ ] Mỗi người trả lời được ≥ 4 câu FAQ
- **Docs cập nhật:** demo.md

## 8. Quản lý task trên Google Sheet

**Nên dùng**, với điều kiện chỉ có một nguồn sự thật: Sheet là nơi theo dõi tiến độ; `plan.md` là nơi đọc chi tiết. Sau khi import, sửa nội dung task trên Sheet; `plan.md` chỉ cập nhật khi đổi phạm vi lớn.

1. Google Sheets → File → Import → Upload `docs/runbook/tasks.csv` → "Replace spreadsheet" (separator: comma, tự nhận UTF-8).
2. Cột **Status**: Data → Data validation → dropdown `Todo, Doing, Review, Blocked, Done`. Conditional formatting: Done = xanh, Blocked = đỏ, **Due < TODAY() và Status ≠ Done = cam**.
3. Bật **Filter**, tạo filter view theo Owner; freeze hàng đầu và 2 cột ID, Title. Sắp xếp theo cột **Due**.
4. Tab **Dashboard**: `=SUMIFS(Tasks!F:F,Tasks!D:D,"Lộc",Tasks!V:V,"Done")/SUMIFS(Tasks!F:F,Tasks!D:D,"Lộc")` để xem % giờ đã xong theo người (F = Est, D = Owner, V = Status). Tab **Milestones** liệt kê M0–M4 + Freeze + Nộp bài.
5. Tab **Bugs** (từ TM-2): ID, mô tả, mức (chặn/cao/thấp), owner theo charter, Status. Tab **Stretch**: ý tưởng nâng cấp, chỉ làm sau M4.
6. Cột **PR / Branch**: dán link PR khi xong; **Actual (h)**: so với ước tính, điều chỉnh tải vào daily sync ngày 10/11 và 14/11.
7. Cột **Mở khoá cho**: khi task của bạn trễ, báo ngay cho owner các task trong cột này.
