# 🛡️ Security report (L10)

> Ngày: 2026-11-17 · Phạm vi: contract trên Fuji (`deployments/fuji.json`), server + web ở bản dev và bản **compose prod** · Người làm: Lộc (track L).
> Mọi con số dưới đây là kết quả chạy thật, có lệnh để chạy lại. Nguồn mối đe doạ: `.agents/skills/agentshield-invariants/references/threat-matrix.md`.

## 1. Tóm tắt

| Hạng mục | Kết quả | Chạy lại |
|---|---|---|
| `pnpm seed --verify` trên **compose prod** (`:8080`) | **40 PASS, 2 WARN, 0 FAIL** | `pnpm seed --verify --api http://localhost:8080 --web http://localhost:8080 --env infra/.env.prod` |
| `pnpm seed --verify` trên dev (`:4000`) | 35 PASS, 1 WARN, 0 FAIL | `pnpm seed --verify --api http://localhost:4000` |
| Test contract | 81 pass (10,000 run mỗi fuzz test), 7 invariant × 100,000 lời gọi, 5/5 mutant bị bắt | `pnpm --filter @agentshield/contracts proof` |
| Fork test trên deployment Fuji thật | 4/4 pass | `FUJI_FORK=true forge test --match-path "test/fork/*"` (trong `packages/contracts`) |
| Slither | 0 high, 0 medium, 4 low, 2 info (đã phân loại, `contracts.md` §7) | `slither . --json slither.json` |
| gitleaks toàn bộ lịch sử git | 101 commit, **0 secret** | `gitleaks git --redact .` |
| `scripts/check-invariants.sh` (P2, P4, P5, env bị commit) | pass | `bash scripts/check-invariants.sh` |

2 WARN còn lại không phải lỗi bảo mật: ví agent còn 0.05 AVAX (nên nạp lên ≥ 0.5 trước demo) và DB prod lúc verify chưa có mẫu finality (đã có sau 2 lệnh rebalance, xem §4).

## 2. Mối đe doạ → lá chắn → bằng chứng

| Mối đe doạ | Lá chắn chặn | Bằng chứng |
|---|---|---|
| **T1** LLM bịa số | Rebalancer là toán thuần; LLM chỉ viết `messageVi` (P3) + cap theo token trên chain | Invariant `noSwapExceedsPerTxCap`, `spentNeverExceedsDailyCap`; `check-invariants.sh` |
| **T2** Prompt injection | Recipient cứng là Safe, path dựng trong module (C2) | Unit `test_gate5_recipientAndPathAreFixedByTheModule_C2`; invariant `fundsOnlyInSafeOrPool` (tiền chỉ nằm ở Safe hoặc pool) |
| **T3** Lộ session key, gọi thẳng chain | 5 gate + cap theo token + Kill-Switch | Fork test thật: vượt cap ⇒ `ExceedsPerTxCap`, sau `revoke` ⇒ `PolicyInactive`; invariant `revokedMeansNoSpend` |
| **T4** Approval vô hạn | Module approve đúng `amountIn` rồi về 0 (C5); agent không phải module ⇒ `GS104` | Fork test: allowance tới router = 0 sau swap thật qua Trader Joe; Safe thật trả `GS104` cho người lạ; invariant `noAllowanceLeftToRouter`; seed A8 |
| **T5** Backend sập / bị chiếm | Server không giữ key owner; Kill-Switch ký trong browser (P2) | `check-invariants.sh` (không có `OWNER_KEY`, server không gửi `setPolicy`/`revoke`); trang `ChainOnlyVault` vẫn Kill khi API chết (test web); invariant `onlyOwnerAndAgentCanAct` |
| **T6** Thao túng giá pool | `minOut > 0`, kiểm theo chênh lệch số dư (C9) | Unit `test_gate5_insufficientOutput_whenRouterIgnoresMinOut_C9`; seed A10 (pool 400,350 USDC, giá 25.04 USDC/WAVAX, lệch 0.2%) |
| **T7** Lộ key owner | Ngoài phạm vi: owner là 1 EOA | Giới hạn đã nói rõ ở `/proof`; roadmap: Safe 2/3 multisig làm owner |

## 3. Vệ sinh key và cấu hình

- Key owner/deployer chỉ nằm trong keystore Foundry (`cast wallet import`), không có trong env, code hay image. `check-invariants.sh` chặn `OWNER_KEY` trong `apps/server`, `infra`, `.github`.
- Key agent (session key) chỉ worker đọc; `seed --verify` **không đọc key nào** (chỉ đọc `FUJI_RPC_URLS` và `AGENT_MIN_GAS_WEI`).
- `.gitignore` chặn `.env`, `.env.*`, các bản env lẻ ở thư mục gốc (`/*.env`), và `slither.json` thô (có đường dẫn máy). gitleaks: 0 secret trong lịch sử.
- API: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `CSP: default-src 'none'; frame-ancestors 'none'`; CORS không cho origin lạ (đã thử `https://evil.example`).
- Web prod (nginx): `X-Frame-Options: DENY` (trang có Kill-Switch không bị nhúng iframe để lừa bấm), SPA deep link và proxy `/api` chạy đúng.

## 4. Phát hiện trong lúc verify

| # | Mức | Phát hiện | Đã xử lý |
|---|---|---|---|
| F1 | **Cao (demo)** | RPC công khai `api.avax-test.network` trả **Cloudflare 429 "Access denied"** cho traffic từ Docker (sau khi bản prod vừa lên quét lại log). Server prod mất chain: `/state` timeout, `rpc: down`. Dev chạy trên host không bị nên khó thấy. | `FUJI_RPC_URLS` giờ là 3 RPC: PublicNode → dRPC → RPC chính thức (server đã hỗ trợ fallback). Web đọc chain qua PublicNode. Các `.env*.example` đã đổi. Sau sửa: prod 0 FAIL. |
| F2 | Trung bình | Image prod không có `proof/tests.json` ⇒ `/proof` trên prod luôn "not run". | Dockerfile chép artifact và đặt `PROOF_TESTS_FILE` (L5). |
| F3 | Trung bình | Web đợi receipt mỗi 4 s (mặc định viem) ⇒ số "Locked after X s" của Kill-Switch bị cộng tới 4 s. | `pollingInterval: 500` như server. |
| F4 | Thông tin | Finality đo thật: **3.7 s** trung bình (3.2–4.2 s, PublicNode, 2 mẫu prod) và 4.9 s (RPC chính thức, 3 mẫu dev). Docs và pitch đang nói ~1.5 s. | Trang `/proof` hết hứa số cứng. **Cần sửa câu pitch** theo số đo, hoặc đo lại với RPC riêng. |
| F5 | Thông tin | Web nginx chưa có CSP (wallet connector tải script riêng). | Ghi nhận; giữ `X-Frame-Options`. |

## 5. Trước giờ demo

1. Nạp AVAX Fuji cho ví agent `0x9A47…be18` lên ≥ 0.5 (seed A9).
2. `pnpm seed --verify --api …` toàn PASS trên máy sẽ dùng để demo.
3. Nếu có RPC riêng (có key), đặt lên đầu `FUJI_RPC_URLS`, đo lại finality và sửa con số trong pitch.
4. Ngân sách ngày reset lúc 00:00 UTC = 07:00 sáng VN (seed A7 in ra giờ còn lại).
