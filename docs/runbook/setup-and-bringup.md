# 🔧 Setup & Bring-up

> Từ máy trắng đến `localhost:3000` chạy được. Các lệnh dưới là **kế hoạch** dựa trên [`codebase.md`](../architecture/codebase.md); cập nhật khi scaffold xong. Mục tiêu: ai trong team cũng dựng lại được môi trường trong < 30 phút.

## 1. Yêu cầu

Node ≥ 20 · pnpm · Docker + Compose · Foundry (`foundryup`) · 2 ví EOA: **owner** (Core/MetaMask) và **agent** (key mới sinh, chỉ để làm session key).

## 2. Biến môi trường

File mẫu: `infra/.env.example`. Server validate bằng Zod lúc boot (`core/config/env.schema.ts`): thiếu biến là **crash ngay**, không đợi tới giữa demo.

| Biến | Dùng bởi | Ghi chú |
|---|---|---|
| `FUJI_RPC_URLS` | server, anvil | Danh sách phân tách bằng dấu phẩy; RPC chính (key riêng) đứng đầu, public RPC làm fallback |
| `CHAIN_ID` | server, web | 43113 |
| `SAFE_ADDRESS` | server, web | |
| `POLICY_MODULE_ADDRESS` | server, web | |
| `TRADERJOE_ROUTER` | server, web | |
| `USDC_ADDRESS` | server, web | `MockUSDC` đã deploy |
| `WAVAX_ADDRESS` | server, web | |
| `AGENT_PRIVATE_KEY` | **chỉ worker** | Session key. **Không bao giờ** là owner key |
| `GEMINI_API_KEY` | worker | |
| `REDIS_URL`, `DATABASE_URL` | server | |
| `ANVIL_RPC_URL` | worker | `http://anvil:8545` |
| `VITE_API_URL`, `VITE_WALLETCONNECT_PROJECT_ID` | web | Biến `VITE_*` bị lộ ra bundle: **không để secret** |

Owner private key **không** có trong bất kỳ file env nào (invariant #5).

## 3. Thứ tự bring-up (lần đầu)

1. **Faucet:** AVAX Fuji cho owner và agent (agent cần AVAX trả gas; attack #4 ký bằng key này).
2. **Contracts:** `cd packages/contracts && forge build && forge test`.
3. **Deploy:** `forge script script/Deploy.s.sol --rpc-url fuji --broadcast` (MockUSDC + module) → `SetupPool.s.sol` (pool MockUSDC/WAVAX trên TJ Fuji).
4. **Safe:** deploy Safe v1.4.1 (Protocol Kit hoặc app.safe.global nếu hỗ trợ Fuji); điền `SAFE_ADDRESS`.
5. **Owner thiết lập (ký bằng ví owner):** `safe.enableModule(module)` rồi `setPolicy(...)`.
6. **ABI:** `pnpm --filter shared gen` (sinh `packages/shared/src/generated/abis.ts`).
7. **Chạy stack:** `docker compose -f infra/docker-compose.yml up` (redis, postgres, anvil, api, worker, web).
8. **Seed + verify:** `pnpm seed --verify` (mint MockUSDC, addLiquidity, fund Safe, fund gas cho agent, kiểm tra policy). Phải in toàn `PASS`.
9. Mở `http://localhost:3000`.

Dev hàng ngày: `pnpm dev`.

## 4. Kiểm tra nhanh sau khi lên

- `GET :4000/state` trả balances và `isActive: true`.
- Bull Board `:4000/admin/queues` thấy 3 queue (`swap`, `attack`, `explain`).
- Bấm "Run Rebalance 200" ⇒ job `confirmed`, thanh budget 200 / 1,500.

## 5. Sự cố thường gặp

| Triệu chứng | Nguyên nhân hay gặp | Cách xử lý |
|---|---|---|
| Server crash lúc boot | Thiếu/sai env | Đọc thông báo Zod, bổ sung `.env` |
| Sim báo `spentInDay` lệch chain | Anvil fork stale | Kiểm tra `anvil_reset` đầu mỗi job; reset thủ công |
| Attack #4 không có tx trên Snowtrace | Client tự `estimateGas` revert | Đảm bảo truyền `gas: 300_000n` thủ công |
| Tx `nonce too low` / nonce gap | 2 nơi ký cùng session key | Mọi tx phải đi qua `TxSender` duy nhất |
| Gemini timeout | Wi-Fi/quota | Bình thường: fallback template, badge `template` |
| Swap revert `InsufficientOutput` | Pool mỏng / giá lệch | Seed lại thanh khoản; giảm `amountIn` |
