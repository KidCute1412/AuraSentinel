# 🔧 Setup & Bring-up (dev local, A1)

> Từ bản clone sạch đến web + api + worker chạy trên máy mình bằng **1 lệnh**. Đã kiểm 14/11 trên một worktree sạch (không `node_modules`, không `dist`, không `.env`): setup ~5 phút (chủ yếu `pnpm install` lần đầu), API lên sau ~2 phút biên dịch lần đầu.
>
> Chạy bản production (1 laptop, nginx, Docker toàn bộ) là file khác: [`production.md`](./production.md). Deploy contract: [`deploy-fuji.md`](./deploy-fuji.md).

## 1. Cần cài

| Công cụ | Ghi chú |
|---|---|
| Git | Clone repo |
| Node **20+** | Đã kèm `corepack`; **không cần cài pnpm riêng** (script gọi `corepack pnpm`) |
| Docker Desktop | Chạy postgres, redis, anvil. Script tự mở Docker Desktop nếu chưa chạy (Windows) |
| Foundry | **Chỉ** khi sửa/deploy contract (`packages/contracts`), không cần cho dev web/server |

## 2. Chạy

```bat
start.bat                 :: Windows
```
```bash
./start.sh                # macOS / Linux
```

Script làm theo thứ tự, dừng ngay ở bước lỗi kèm gợi ý sửa:

1. Tạo `apps/server/.env` từ `apps/server/.env.example` (chỉ lần đầu, **không bao giờ ghi đè**). Đây là **file env duy nhất** khi dev: web và Docker không cần file nào.
2. `pnpm install --frozen-lockfile`.
3. Build `packages/shared` (server và web đều import `dist/` của nó).
4. Docker: postgres `:55432`, redis `:56379`, anvil fork Fuji `:8545`; chờ healthy.
5. Migration DB (`drizzle-kit migrate`).
6. Mở terminal chia đôi: web (Vite) | api + worker (Nest watch). Chờ `GET /api/health`, rồi mở trình duyệt.

| Địa chỉ | |
|---|---|
| http://localhost:5173 | Web (Vite, proxy `/api` sang `:4000`) |
| http://localhost:4000/api/health | Health: `ok` khi postgres, redis, rpc, worker đều up |
| http://localhost:4000/api/v1/... | API ([`api.md`](../architecture/api.md)) |

Chỉ dựng môi trường, không mở cửa sổ: `start.bat --setup-only` / `./start.sh --setup-only`.

## 3. Env: chỉ cần key agent

Mọi giá trị công khai đã có mặc định trong code, không phải chép vào `.env`: địa chỉ contract Fuji + block bắt đầu của indexer (`packages/shared/src/deployments.ts`, test kiểm khớp `fuji.json`), 3 RPC Fuji công khai, cổng Postgres/Redis local, `SIWE_DOMAINS=localhost:5173`, các giới hạn (`apps/server/src/core/config/env.schema.ts`). Web mặc định chạy **live** (gọi server qua proxy Vite); muốn giả lập không cần server thì tạo `apps/web/.env.local` với `VITE_DATA_SOURCE=mock`.

Trong `apps/server/.env` chỉ điền:
- `AGENT_PRIVATE_KEY`: key **session** của agent (xin người giữ key của nhóm). Không bao giờ là key owner. Thiếu nó thì worker vẫn chạy, đọc chain Fuji thật nhưng **không gửi tx** (log `TxSender: FAKE`). Production thì **từ chối** chạy bản giả.
- Tuỳ chọn: `GEMINI_API_KEY` (giải thích bằng LLM), `ADMIN_ADDRESSES` (ví của mình, để mở drawer Admin / Demo mode).

> ⚠️ Mỗi lúc chỉ **một máy** chạy worker với key agent trên Fuji (một chuỗi nonce, P4). Ai chỉ làm UI thì dùng `VITE_DATA_SOURCE=mock`, khỏi cần key.

Muốn đổi mặc định (RPC riêng, cổng khác...) thì thêm dòng vào `apps/server/.env`; các dòng mẫu nằm cuối file example. **Không cần Fuji:** deploy lên chính Anvil local bằng script L4 (như CI `deploy-dry-run`), xem [`production.md`](./production.md) §6, rồi ghi đè `FUJI_RPC_URLS=http://127.0.0.1:8545` và 6 biến địa chỉ bằng `deployments/fork.json`; simulator cần một Anvil thứ hai fork từ Anvil đó (`ANVIL_RPC_URL`).

## 4. Hằng ngày

- Lần sau chỉ cần chạy lại `start.bat` (bước nào đã xong thì chạy rất nhanh).
- Dừng hạ tầng: `docker compose -f infra/docker-compose.yml down` (giữ dữ liệu); thêm `-v` để xoá DB.
- Test: `corepack pnpm -r test`; e2e cả pipeline: [`production.md`](./production.md) §7.
- Đăng nhập SIWE khi dev: `SIWE_DOMAINS` mặc định `localhost:5173`, không cần điền.

## 5. Sự cố thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| `Docker did not become ready` | Mở Docker Desktop tay, chờ "Engine running", chạy lại |
| `docker compose failed` ở anvil | RPC Fuji (mặc định PublicNode) không truy cập được: thử lại, hoặc tạo `infra/.env` với `FORK_URL=<RPC Fuji khác>` (compose tự đọc file này) |
| Cổng `55432` / `56379` / `8545` / `4000` / `5173` bị chiếm | Tạo `infra/.env` với `POSTGRES_PORT` / `REDIS_PORT` / `ANVIL_PORT` mới **và** ghi đè `DATABASE_URL` / `REDIS_URL` / `ANVIL_RPC_URL` trong `apps/server/.env` |
| API không lên sau 4 phút | Xem cửa sổ Backend: thường là thiếu/sai env (Zod in rõ biến nào) |
| Web báo lỗi import `@agentshield/shared` | `corepack pnpm --filter @agentshield/shared build` (script đã làm; cần lại sau khi sửa `packages/shared`) |
| Health `rpc: down` | RPC Fuji public chập chờn: thêm RPC khác vào `FUJI_RPC_URLS` |
| Tx `nonce too low` | Hai worker cùng một key agent (vd. dev + compose prod cùng chạy): tắt một bên |
| Đăng nhập báo `Message issued for ...` | `SIWE_DOMAINS` phải là host trình duyệt đang mở (`localhost:5173` khi dev) |
