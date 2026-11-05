# Kế hoạch AgentShield (v3, gọn)

> **v3, 06/11/2026:** rút gọn từ v2. Đội: **Lộc** (On-chain & Owner UX), **Đan Anh** (Platform, Backend & Production), **Duy Quốc** (Agent Intelligence & Experience).
> Spec kỹ thuật: `system-design.md`, `codebase.md`, `contracts.md`. File này chỉ trả lời: **có gì, thiếu gì, ai làm gì, hạn nào, xong khi nào.**
> Bảng task nằm ở `docs/runbook/tasks.csv` (cùng dữ liệu với mục 6). Mỗi task chỉ nêu *kết quả cần đạt*; cách làm do người nhận tự quyết.

## 1. Mục tiêu

**Thể lệ (team1vn.xyz):**
- Hạn nộp **23:59 T7 21/11**. Nhóm tự đặt hạn **22:00 T6 20/11**.
- Nộp: repo GitHub (public, hoặc private và thêm `tuantqse90`), link slide, **video demo 2–3 phút**. Link giám khảo không mở được thì bị loại.
- Giám khảo tự mở sản phẩm, nên **bắt buộc có URL production** (không dựa vào Anvil trên laptop).
- Top 10 vào Demo Day live 09:00 T2 30/11. Track: "AI agents and security". Mạng: Fuji.

**Tiêu chí → việc ăn điểm:**

| Tiêu chí | Điểm | Ăn điểm bằng |
|---|---|---|
| Technical | 25 | Contract + fuzz 10k + invariant, simulator Anvil, pipeline Auditor, 25 case injection, auth, Slither |
| Avalanche | 25 | Mọi contract verify trên Snowtrace, factory + wizard tạo vault trên Fuji, finality đo thật (Kill ~1,5s), trang /proof |
| Creativity | 15 | 2 lớp khiên, 4 đòn tấn công thật, LLM không có quyền |
| Impact | 15 | Wizard tạo vault, rebalancer 24/7 nhiều vault, nạp/rút |
| Pitching | 10 | Slide, video, Demo Day |
| UI/UX & Demo | 10 | Design system, landing + tour, URL production |

**Đường găng:** L1 → L2 → L4 (Fuji) → A5/A6 → **Milestone A 12/11** → A7 (prod) → **Milestone B 17/11** → nộp 20/11.

**Thuật ngữ dùng trong các task:**

| Từ | Nghĩa |
|---|---|
| Safe / vault | Ví multisig chứa tiền của owner; "vault" là Safe + module bảo vệ nó |
| Module / policy | Contract on-chain giới hạn việc agent được làm; policy là bộ luật owner đặt (hạn mức, hạn dùng, địa chỉ agent) |
| Shield 1 / Shield 2 | Shield 1 = Auditor ngoài chain chặn trước khi gửi lệnh (không tốn gas); Shield 2 = contract chặn trên chain |
| P1–P5 | 5 nguyên tắc bất biến trong skill `agentshield-invariants` (chain là nguồn sự thật, owner tự ký, LLM không quyết, số tiền là bigint, chỉ `execution` chạm session key) |
| D1–D16 | Quyết định kỹ thuật cần chốt ở T0 (mục 3) |
| Epoch | Số đếm tăng mỗi lần `setPolicy`; policy mới thì ngân sách ngày tính lại từ 0 (D10) |
| Gate | Một điều kiện kiểm trong contract (agent đúng, còn hạn, không vượt hạn mức…) |
| Intent | Một lệnh swap mà agent muốn thực hiện, trước khi được kiểm |
| Session key | Khoá ví của agent, chỉ giao dịch trong phạm vi policy |
| Reason code | Mã lý do một lệnh bị chặn (vd `ExceedsPerTxCap`) |
| Stale | Dữ liệu lấy từ bản lưu cũ vì RPC lỗi, có thể không còn đúng |

## 2. Hiện trạng (audit 05/11)

Mới có khung, chưa có chức năng. `tsc` xanh, 7 unit test xanh; docker compose, `start.bat`, `pnpm dev` chưa kiểm chứng.

| Mảng | Đã có | Còn thiếu |
|---|---|---|
| Monorepo, CI, invariants check, skills | pnpm/turbo, CI 4 job, gitleaks | Job contracts đang skip (chưa có foundry.toml) |
| `infra/` | compose: postgres, redis, anvil fork | Chưa chạy thử; chưa có Dockerfile, compose prod |
| `core/*` | config, database (4 bảng), redis event bus, queue, chain client | Migration lệch spec (status, vaults), ServerEvent mới 2/5 loại |
| Modules server | jobs, realtime SSE; precheck + rebalance math có test | **Stub/TODO:** simulator, tx sender, indexer, vault, policy (đang đọc DB, ngược P1), explainer chưa chuẩn, auditor chưa đủ pipeline, redteam mới 2/4 đòn |
| `packages/shared` | không có | Toàn bộ: schemas, events, errors, money, abis |
| `packages/contracts` | không có | Toàn bộ: module, factory, mocks, test, deploy |
| `apps/web` | Vite + React 19 + Tailwind + shadcn config, dependency đã cài | App shell, mọi feature, lớp api/web3 |
| `scripts/seed.ts`, README gốc | không có | Toàn bộ |

## 3. Quyết định chốt ở T0 (06/11)

Cột **Kết luận** điền trong buổi họp. Không chốt được trong 2h thì: Lộc quyết contract/web3, Đan Anh quyết backend/infra, Duy Quốc quyết AI/UX.

| # | Đề xuất | Kết luận |
|---|---|---|
| D1 | Status job theo docs: `rejected` (Shield 1 chặn), `reverted` (Shield 2 chặn), `broadcasting`; cần migration | **Chốt:** theo docs. DB chưa có dữ liệu thật nên migration rẻ; cần phân biệt Shield 1 và Shield 2 |
| D2 | `SwapIntent = {tokenIn, tokenOut, amountIn, minAmountOut, recipient, origin}`; `recipient` chỉ để precheck/red-team, contract không nhận | **Chốt:** có `recipient`, calldata builder phải bỏ trường này (có test); `minAmountOut` > 0 |
| D3 | Sender trả `{hash, status, revertData?}` + `sendRaw`; SimResult thêm `allowance`, `attackerBalance` | **Chốt:** revert là kết quả mong đợi (đòn #4 cần txHash), không ném exception |
| D4 | `PrecheckPolicy` theo từng token (`limits[token]`, `spentToday[token]`), `now` lấy từ block timestamp | **Chốt:** tránh lỗi C1; đọc block timestamp cùng lúc với state |
| D5 | Commit ABI JSON vào `packages/contracts/abi/`; `shared gen` đọc từ đó (CI không có forge) | **Chốt:** thêm job contracts (có forge) build lại và `git diff --exit-code abi/` để bắt drift |
| D6 | Reason code: một bảng trong `shared/errors.ts`, tên khớp error của contract | **Chốt:** gộp tên error on-chain và mã off-chain (`GS104`, `UNKNOWN_REVERT`); CI test mọi error trong ABI đều có mục |
| D7 | Owner key chỉ ở Foundry keystore; `seed --verify` chỉ đọc | **Chốt:** `seed` không tự setPolicy; reset sandbox do người ký bằng ví |
| D8 | Giá từ `getAmountsOut(10^decA)`; thêm test khác decimals (USDC 6, WAVAX 18) | **Chốt:** dùng lượng mẫu đủ lớn để không làm tròn về 0 ở pool mỏng; Chainlink để stretch |
| D9 | Owner module = EOA owner của Safe; factory kiểm `ISafe.isOwner(msg.sender)`; Kill vẫn là 1 tx trực tiếp | **Chốt:** nói rõ rủi ro 1 EOA trong pitch; owner khác của Safe vẫn `disableModule` được |
| D10 | `policyEpoch++` mỗi lần `setPolicy` → policy mới = budget mới (reset sandbox, kích hoạt lại sau Kill) | **Chốt:** key `spent[epoch][token][day]`; event `PolicySet` mang `epoch` |
| D11 | API multi-vault `/api/v1/vaults/{safe}/{state,jobs,attacks,events}` (chi tiết: `architecture/api.md`); mọi ServerEvent có `vault`; bảng `vaults` chỉ là registry (P1) | **Chốt:** giữ thứ tự cắt phạm vi (wizard rút gọn) nếu trễ |
| D12 | Auth SIWE + cookie JWT httpOnly: visitor (chỉ vault demo, rate limit), owner (kiểm `Safe.getOwners` on-chain), admin (allowlist env). setPolicy/Kill vẫn ký trên browser | **Chốt (đổi):** vault demo KHÔNG cần đăng nhập, throttle theo IP + cooldown toàn cục (giám khảo không cần ví). SIWE chỉ cho owner và admin |
| D13 | 1 agent EOA dùng chung mọi vault, 1 queue swap concurrency 1 (P4); session key riêng từng vault để roadmap | **Chốt:** nói rõ trong pitch: key lộ bị chặn bởi cap và Kill của từng vault |
| D14 | 1 VPS (≥ 2 vCPU, 4 GB) chạy `docker-compose.prod.yml` (caddy, web, api, worker, pg, redis, anvil); owner key không lên server | **Chốt:** snapshot VPS + compose chạy lại được trên máy khác làm dự phòng |
| D15 | Vault demo: maxPerTx 500, dailyCap 1.500 USDC; hết budget → UI giải thích "Shield 2 đang chặn"; Lộc reset bằng setPolicy ký trên browser; rebalancer tắt cho vault demo | **Chốt (sửa):** vault demo công khai giữ 500/1.500 + cooldown; thêm **vault sân khấu** riêng cho demo trực tiếp, reset ngay trước giờ diễn |
| D16 | Routes web: `/` landing · `/demo` · `/vaults/new` · `/vaults/:safe` · `/proof` | **Chốt (sửa):** admin là drawer trong dashboard (chỉ role admin), không có route `/admin` |

Bốn mục ❓ trong `contracts.md` (whitelist tách mapping?, nonReentrant, ...): Lộc chốt trong L1.

## 4. Charter: ai sở hữu gì, được tự quyết tới đâu

Mỗi người là **owner** của một mảng từ đầu đến cuối (code, test, docs, chất lượng trên production), không chỉ nhận ticket.

| | **Lộc**: On-chain & Owner UX | **Đan Anh**: Platform, Backend & Production | **Duy Quốc**: Agent Intelligence & Experience |
|---|---|---|---|
| Sứ mệnh | Luật on-chain không thể vượt qua; owner tự tay kiểm soát tiền | Hệ thống chạy thật, an toàn, 24/7 trên URL public | Agent thông minh nhưng không có quyền; trải nghiệm khiến giám khảo hiểu ngay |
| Sở hữu | `packages/contracts`, `shared/abis`, `execution/revert-decoder`, `scripts/seed.ts`, web `shared/web3` + `features/{policy,kill-switch,vault,onboarding,proof}` | `shared/{schemas,events,money,chain}`, `core/*`, modules policy/vault/simulation/execution/auditor service/jobs/realtime/indexer/auth, `infra/`, deploy workflow | `shared/errors.ts`, `auditor/domain`, `explainer`, `rebalancer`, `redteam`, web `app/` + `shared/{ui,api,store}` + `features/{activity,red-team,landing}`, pitch |
| Tự quyết | Thiết kế trong contract, gas, UX ký ví | Thư viện, hạ tầng, rate limit, nhà cung cấp VPS | Prompt, copy tiếng Việt, ngôn ngữ thiết kế, câu chuyện pitch, chiến lược rebalance |
| Báo nhóm trước khi đổi | ABI, event, error | DTO, ServerEvent, route API | Reason code, component dùng chung |
| Review chéo | PR của Đan Anh ở execution/indexer | PR của Lộc ở web3/wizard | PR của Lộc và Đan Anh ở `apps/web` |
| Stretch (sau M4) | Chainlink, owner multisig | Session key từng vault | Telegram báo owner, giao diện EN, báo cáo rủi ro |

**Luật chung:**
1. **P1–P5 và Shield 1/2** (skill `agentshield-invariants`) thắng mọi ý tưởng. Muốn khác thì sửa docs và báo nhóm trước.
2. **Interface trước, code sau.** Sau tag `interfaces-v1`, đổi `packages/shared` hoặc ABI phải báo nhóm và có người approve.
3. **Sáng tạo nằm trong mảng của mình.** Làm thêm ngoài task chỉ khi P0 của mình đã Done; ghi ý tưởng vào tab Stretch trước.
4. Mỗi task 1 nhánh, PR nhỏ, review trong ngày. Daily sync 10 phút (hôm qua / hôm nay / bị chặn).
5. **Done** = merge + CI xanh + test chạy + review chéo + docs liên quan đã sửa. Từ 14/11: chạy được trên production.

## 5. Lộ trình

| Mốc | Ngày | Đạt khi |
|---|---|---|
| **M0** Nền móng | T7 07/11 | D1–D16 có kết luận; tag `interfaces-v1`; ABI draft + `shared` build; local chạy trên 3 máy; có VPS + DNS |
| **M1** Fake end-to-end | T3 10/11 | `POST /vaults/{safe}/jobs` đi hết state machine bằng Fake, SSE phát event; contract có test từng gate |
| **M2 = Milestone A** | T5 12/11 | 1 swap thật trên Fuji: job `confirmed`, có link Snowtrace, `allowance = 0`, 3 lần liên tiếp |
| **M3** Prod skeleton | T7 14/11 | `https://<domain>` chạy landing + `/demo` đọc state thật + SSE |
| **M4 = Milestone B** | T3 17/11 | Trên production: kịch bản 3 phút trọn vẹn, 4 đòn + injection, wizard, auth + rate limit, fuzz 10k xanh |
| **Freeze** | T4 18/11 | Tag `v1.0-rc`, bug bash chéo, `seed --verify` trên prod PASS |
| **Nộp bài** | 19–20/11 | Video, slide, README, repo public; form trước 22:00 20/11; tag `v1.0` |
| **Demo Day** | 22–30/11 | Rehearsal x5, không deploy trong 24h trước 30/11 |

**Cắt phạm vi nếu trễ (từ trên xuống):** Stretch → guided tour (Q11, thay bằng hướng dẫn tĩnh) → integration test + monitoring (A10) → nút Rút tiền (L8) → fork test/Slither (L10) → wizard rút gọn (L9: Safe tạo bằng script).
**Không bao giờ cắt:** contract + fuzz/invariant, đòn #4, Kill-Switch, fallback template, URL production, auth route admin, video, README.

**Rủi ro:**
- *Contract trễ:* hết 10/11 chưa có test gate xanh → Đan Anh và Duy Quốc viết test Foundry đơn giản, Lộc tập trung logic. L4 có thể chạy trên Anvil fork trước.
- *Thanh khoản/địa chỉ router Fuji (rủi ro #1):* kiểm chứng sớm trong L4, đừng tin trí nhớ.
- *Production trễ:* A7 bắt đầu ngay khi A6 chạy bằng Fake. Đến 14/11 chưa có URL thì dừng A8 để làm A7.
- *Gas agent / quota Gemini / giám khảo dùng hết budget sandbox:* A9 chặn khi gas thấp, Q6 limiter + template, D10+D15 reset; nạp sẵn ≥ 5 AVAX test cho agent; kiểm sandbox mỗi sáng từ 18/11.

## 6. Task theo người

Ưu tiên: **P0** bắt buộc · **P1** cắt được theo mục 5. Cột "Xong khi" là điều kiện nghiệm thu; phần còn lại tự quyết. Giờ ước tính và cột "Depends on" (kèm tên task) nằm ở CSV. Task lớn có ghi thứ tự gợi ý (1)(2)(3); đổi thứ tự được nếu có lý do.

### Lộc: On-chain & Owner UX (87h)

| ID | Hạn | Làm gì | Xong khi |
|---|---|---|---|
| L1 | 07/11 | Dựng contract skeleton và xuất ABI cho cả nhóm: (1) chốt D9, D10 và các mục ❓ trong contracts.md; (2) Foundry scaffold + interface Module/Factory/MockUSDC, commit ABI (bản draft trong 06/11); (3) scaffold `packages/shared` + script `gen`; (4) job CI contracts: build lại ABI và `git diff --exit-code` thư mục `abi/` (D5) | `forge build` xanh; server + web import được ABI |
| L2 | 09/11 | Viết AgentPolicyModule: (1) lưu policy, setPolicy (mỗi lần tăng epoch; event `PolicySet` mang `epoch`, spent key theo epoch, D10), revoke, spentToday; (2) executeGuardedSwap kiểm lần lượt các gate theo contracts.md §4 | Mỗi gate có test revert đúng error; biên ±1; qua ngày counter về 0 |
| L3 | 10/11 | AgentShieldFactory + MockUSDC faucet | Non-owner không deploy được; faucet có cooldown |
| L4 | 11/11 | Deploy Fuji: MockUSDC, pool TJ, factory, Safe + module cho **2 vault demo** (công khai: maxPerTx 500 / dailyCap 1.500; sân khấu: riêng, reset trước giờ diễn; D15), policy; verify Snowtrace; ghi địa chỉ vào env/shared | Mọi contract Verified; 1 swap thủ công thấy trên Snowtrace |
| L5 | 12/11 | Fuzz 10.000 runs + invariant test có Handler; CI xuất `proof/tests.json` (số run, invariant, Slither) cho `GET /proof` | `forge test --fuzz-runs 10000` xanh: attacker không lời, spent ≤ cap, allowance = 0 |
| L6 | 13/11 | revert-decoder: custom error, GS104, lỗi router → reason code | Mỗi error map đúng; selector lạ → UNKNOWN_REVERT |
| L7 | 14/11 | Policy panel (owner ký setPolicy trên browser, kích hoạt lại sau Kill) + Kill-Switch đo độ trễ | Tắt backend vẫn Kill được; UI chuyển đỏ; "Đã khoá sau X,Y giây" |
| L8 | 15/11 | Vault panel: số dư trước/sau, thanh budget ngày, nạp tiền, rút tiền | Nạp 100 USDC thấy số dư tăng realtime |
| L9 | 16/11 | (1) Wizard `/vaults/new`: tạo Safe → module → policy → faucet + nạp; (2) trang `/proof` (contract đã verify, kết quả fuzz, tx mẫu); (3) link explorer + hỗ trợ Core wallet | Ví mới tạo vault end-to-end < 3 phút, đóng tab mở lại vẫn tiếp tục |
| L10 | 18/11 | `scripts/seed.ts --verify` (chỉ đọc, local và prod, cả 2 vault demo); fork test Fuji + Slither + security-report (P1) | Verify toàn PASS trên prod |

### Đan Anh: Platform, Backend & Production (91h)

| ID | Hạn | Làm gì | Xong khi |
|---|---|---|---|
| A1 | 06/11 | Làm local chạy thật (start.bat → docker → migrate → dev); thuê VPS + domain | 3 máy chạy được; `curl localhost:4000/state` ra JSON; có IP VPS |
| A2 | 07/11 | Zod schema dùng chung: intent, sim, job, state, vault, auth, ServerEvent (có `vault`, thêm `vault.registered`), lỗi problem+json (RFC 9457), money, chain; thay placeholder | Server compile; round-trip bigint; event sai schema bị từ chối |
| A3 | 09/11 | (1) Migration DB theo D1/D11; (2) `PolicyService` đọc policy + số đã chi từ contract; (3) `setGlobalPrefix('api/v1')` và chuyển controller hiện có sang route trong `api.md` §2; `GET /vaults`, `GET /vaults/{safe}`, `GET /vaults/{safe}/state`; lỗi trả problem+json | State luôn từ chain (P1); RPC lỗi → trả bản lưu cũ kèm cờ `stale` (dữ liệu có thể đã cũ) |
| A4 | 09/11 | ViemTxSender thật: mutex dùng chung, nonce, gas thủ công, receipt, `sendRaw` | 2 lời gọi song song chạy tuần tự; tx revert vẫn có hash |
| A5 | 11/11 | AnvilSimulator thật (reset, impersonate agent, đọc state trước/sau) | Hợp lệ → ok; vượt cap → ExceedsPerTxCap; sim < 1s |
| A6 | 12/11 | AuditorService đủ pipeline theo vault (precheck → sim → invariants → verdict → broadcast ‖ explain) + `POST /vaults/{safe}/jobs` (202 + `Location`), `GET /vaults/{safe}/jobs`, `GET /jobs/{id}` kèm audit; calldata builder bỏ `recipient` (có test, D2) | 5 đường (approved, 3 loại reject, tx-revert) test xanh; explainer chậm không trễ broadcast |
| A7 | 14/11 | Dockerfile, compose.prod, Caddy; dựng VPS (TLS, firewall, `.env.prod`, fund agent) | `https://<domain>` chạy landing + `/demo` + SSE; owner key không lên server |
| A8 | 15/11 | Indexer: ModuleDeployed → registry; event module → `chain.*`; cursor idempotent; phát `vault.registered`; `GET /proof` (địa chỉ, finality từ `chain.revoked.latencyMs`, test summary từ file CI của L5) | Vault từ wizard xuất hiện ≤ 5s; chạy lại cùng đoạn block không trùng |
| A9 | 16/11 | SIWE (chỉ cho owner/admin, D12) + OwnerGuard on-chain + AdminGuard; vault demo công khai không cần đăng nhập nhưng throttle theo IP + cooldown toàn cục; CORS, helmet, chặn khi agent sắp hết gas; `PUT /vaults/{safe}` (P1, bỏ nếu indexer ≤ 5s ổn định) | Không phải owner → 403; Bull Board cần admin; khách bấm liên tiếp ở vault demo → 429 |
| A10 | 18/11 | GitHub Actions deploy; `/api/health` + uptime + cảnh báo Telegram (P1); integration test với Anvil thật (P1) | Push main → tự deploy + smoke xanh |

### Duy Quốc: Agent Intelligence & Experience (88h)

| ID | Hạn | Làm gì | Xong khi |
|---|---|---|---|
| Q1 | 07/11 | `shared/errors.ts`: error → reason code → câu tiếng Việt (có chỗ điền số) | Mọi error trong ABI có mục (gồm mã off-chain, `GS104`, `UNKNOWN_REVERT`); tên khớp contract; CI test fail nếu thiếu mục (D6) |
| Q2 | 08/11 | App shell: router D16 (5 route, admin là drawer), providers (wagmi v2, RainbowKit, Query), design system, responsive | Kết nối Core/MetaMask trên Fuji; mobile ≥ 375px không vỡ |
| Q3 | 10/11 | Code thuần (không Nest/viem/DB) của Auditor: (1) precheck: kiểm lại đúng các điều kiện của contract + kiểm ý đồ lệnh; (2) invariants: kiểm kết quả kinh tế sau mô phỏng; (3) verdict + `budgetUsedPct` (% ngân sách ngày đã dùng, bigint) | Table test từng gate và thứ tự reason; 200/1500 = 13,3% |
| Q4 | 10/11 | Lớp dữ liệu web: http (Zod, cookie), SSE theo vault + reconnect, hook `useVaultState/useJobs/useJob` | Event sai schema bị bỏ; nối lại SSE thì refetch snapshot |
| Q5 | 11/11 | Explainer: Gemini (responseSchema, `<untrusted_input>`, timeout) + Template tiếng Việt từng reason code | Gemini lỗi/chậm → template; mọi reason code có câu |
| Q6 | 12/11 | Numeric-consistency guard + ≥ 25 fixture prompt injection; cache + limiter RPM (P1) | LLM bị lừa cũng không đổi verdict/số tiền; spam nút không chạm quota |
| Q7 | 14/11 | Rebalancer chạy 24/7 qua mọi vault đang bật, quyết định bằng toán (không LLM), giá từ `getAmountsOut` với lượng mẫu đủ lớn (D8), bỏ qua vault demo công khai (D15); số tiền không vượt ngân sách ngày còn lại; chạy lặp không tạo job trùng | Số tiền mỗi lệnh ≤ hạn mức mỗi lệnh và ≤ ngân sách ngày còn lại; không có job trùng; test được với token khác decimals |
| Q8 | 14/11 | Red-team 4 đòn + injection theo vault (`POST /vaults/{safe}/attacks`, body `{scenario, text?}`), dùng chung TxSender | Bypass có txHash reverted `ExceedsPerTxCap`; số dư Safe không đổi sau 4 đòn |
| Q9 | 15/11 | Activity: timeline Shield 1/2, thẻ giải thích, link Snowtrace, chi tiết job | Đọc được từ xa trên projector; không vỡ khi giải thích đến muộn |
| Q10 | 16/11 | Red-team panel: Run Rebalance, 4 nút tấn công, ô injection, drawer Admin (Demo mode, chỉ role admin; D16) | Bấm đủ kịch bản trên prod |
| Q11 | 17/11 | Landing + How it works + guided tour cho `/demo` | Người lạ hiểu sản phẩm trong ~30s |
| Q12 | 19/11 | Slide + script video + FAQ + README gốc (Lộc, Đan Anh viết phần mình) | Người ngoài đọc README là chạy được |

### Cả nhóm

| ID | Hạn | Nội dung |
|---|---|---|
| T0 | 06/11 | Kickoff: chốt D1–D16, dựng Sheet, tag `interfaces-v1` (sau L1 + A2) |
| T1 | 12/11 | **Milestone A:** 1 swap thật trên Fuji từ POST rebalance đến confirmed + Snowtrace, 3 lần liên tiếp |
| T2 | 17/11 | **Milestone B:** chạy trọn kịch bản 3 phút trên URL production |
| T3 | 18/11 | Freeze, bug bash chéo, tag `v1.0-rc` |
| T4 | 20/11 | Quay video, chốt slide + README, nộp form trước 22:00 |
| T5 | 20/11 | (P2, tuỳ chọn) Builder Pass |
| T6 | 29/11 | Chuẩn bị Demo Day: rehearsal x5, Q&A, phương án dự phòng |

Tải: mỗi người ~85–88h task riêng + ~17h task nhóm ≈ 100–105h đến 20/11 (~7h/ngày). Nếu chỉ có ~5h/ngày, áp luật cắt ở mục 5 từ 13/11.

## 7. Google Sheet

Import `docs/runbook/tasks.csv` (File → Import → Replace spreadsheet). Cột **Status**: dropdown `Todo, Doing, Review, Blocked, Done`; tô màu Done xanh, Blocked đỏ, quá hạn cam. Bật filter theo **Owner**, sắp theo **Due**. Thêm tab **Bugs** (từ T2) và **Stretch** (ý tưởng, chỉ làm sau M4). Sheet là nơi theo dõi tiến độ; chỉ sửa `plan.md` khi đổi phạm vi lớn. Task trễ thì báo ngay owner của các task có "Depends on" trỏ tới nó.
