# 🏭 Chạy production (A7)

> D14: toàn bộ demo chạy bằng `docker compose` trên một laptop, không VPS, không TLS, không domain. Video demo là phương án dự phòng.
> Khác với dev (`infra/docker-compose.yml` chỉ có hạ tầng, api/worker chạy bằng `pnpm dev`), file prod build và chạy **cả 7 service**.

## 1. Chuẩn bị (1 lần)

1. Docker Desktop đang chạy.
2. L4 đã deploy xong: có `packages/contracts/deployments/fuji.json` (xem [`deploy-fuji.md`](./deploy-fuji.md)).
3. Tạo file env:
   ```bash
   cp infra/.env.prod.example infra/.env.prod
   ```
   Điền theo bảng dưới. File này đã gitignore. **Không bao giờ để key owner/deployer ở đây.**

| Biến | Lấy từ |
|---|---|
| `POSTGRES_PASSWORD` | Tự đặt |
| `FUJI_RPC_URLS`, `FORK_URL` | RPC Fuji riêng đứng đầu, public RPC làm fallback |
| `AGENT_PRIVATE_KEY` | Key **session** của ví agent (L4 bước 0). Nạp ~0.5 AVAX Fuji cho gas |
| `SAFE_ADDRESS`, `POLICY_MODULE_ADDRESS` | `publicSafe`, `publicModule` trong `fuji.json` |
| `TOKEN_A_ADDRESS`, `TOKEN_B_ADDRESS` | `usdc`, `wavax` |
| `FACTORY_ADDRESS` | `factory` |
| `INDEXER_START_BLOCK` | Block deploy factory (Snowtrace, tx đầu tiên của factory) |
| `GEMINI_API_KEY` | Tuỳ chọn; không có thì giải thích dùng template |

## 2. Chạy

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build --wait
```

Mở `http://localhost:8080` (đổi bằng `WEB_PORT`). Chỉ cổng web được mở ra máy; postgres, redis, anvil, api nằm trong mạng nội bộ của compose.

| Service | Vai trò |
|---|---|
| `postgres`, `redis` | Read-model + audit log; queue BullMQ + pub/sub SSE |
| `anvil` | Fork Fuji chỉ để mô phỏng (Shield 1). Tx thật đi `FUJI_RPC_URLS` |
| `migrate` | Chạy migration một lần rồi thoát; api/worker chờ nó xong |
| `api` | REST + SSE. **Không có key nào** |
| `worker` | Auditor, Rebalancer, Red-team, Indexer. **Service duy nhất có `AGENT_PRIVATE_KEY`** |
| `web` | nginx: SPA + proxy `/api` (tắt buffering cho SSE) |

Kiểm tra nhanh:
```bash
curl http://localhost:8080/api/health     # status "ok": postgres, redis, rpc, worker đều up
```
`status: "degraded"` (vẫn 200) khi RPC hoặc worker chết: state trả bản cũ `stale: true`, job chờ trong queue. `503` khi postgres hoặc redis chết.

## 3. Thao tác thường gặp

| Việc | Lệnh |
|---|---|
| Xem log | `docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod logs -f worker api` |
| Cập nhật code | `git pull` rồi chạy lại lệnh ở mục 2 (`--build`); migration tự chạy |
| Dừng (giữ dữ liệu) | `... down` |
| Xoá sạch dữ liệu | `... down -v` (mất lịch sử job; chain không bị ảnh hưởng) |

## 4. Giám sát (tuỳ chọn)

Service `watchdog` (profile `monitoring`) gọi `/api/health` mỗi 30s và đọc số dư AVAX của ví agent, nhắn **Telegram** khi trạng thái đổi: API/RPC/worker chết, agent sắp hết gas (< 0.1 AVAX), và khi hồi phục. Phải lỗi 2 lần liên tiếp mới báo, nên một lần RPC chậm không gây nhiễu. Chỉ đọc dữ liệu công khai (JSON health, **địa chỉ** agent), không cầm key.

1. Tạo bot bằng @BotFather → `TELEGRAM_BOT_TOKEN`; lấy chat id bằng @userinfobot → `TELEGRAM_CHAT_ID`.
2. Điền thêm `AGENT_ADDRESS` (địa chỉ ví agent, không phải key) trong `.env.prod`.
3. Thêm `--profile monitoring` vào lệnh ở mục 2.

Không có token thì watchdog chỉ ghi log (`docker compose ... logs watchdog`).

## 5. Sự cố

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| `worker` khởi động lại liên tục | Thiếu `AGENT_PRIVATE_KEY` hoặc `POLICY_MODULE_ADDRESS`: production cố ý không chạy bản giả |
| Health `rpc: down` | RPC Fuji lỗi: thêm RPC dự phòng vào `FUJI_RPC_URLS` |
| Job `rejected` `UnauthorizedAgent` | Key trong env không phải agent của policy (`AGENT_ADDRESS` lúc deploy) |
| Indexer log `block range too large` | Giảm `INDEXER_MAX_SPAN` (RPC public Fuji cho tối đa 100) |
| Cổng 8080 bị chiếm | Đặt `WEB_PORT=8090` trong `.env.prod` |

## 6. Diễn tập không cần Fuji

Chạy được nguyên stack trên Anvil local (dùng để kiểm trước khi L4 deploy):
1. `docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --wait` (Anvil A = "Fuji").
2. Deploy bằng script L4 với key dev của Anvil (`DEPLOYMENT=fork`, như job CI `deploy-dry-run`).
3. Trong `infra/.env.prod`: `FUJI_RPC_URLS=FORK_URL=http://host.docker.internal:8545`, key agent = Anvil #1, địa chỉ lấy từ `deployments/fork.json`.
4. Chạy lệnh ở mục 2.

## 7. Test tự động (CI)

Job `integration` làm lại đúng mục 6 trong CI: deploy bằng script L4 lên Anvil fork, boot api + worker đã build và chạy `apps/server/test/e2e/pipeline.e2e.spec.ts` (3 rebalance `confirmed`, allowance = 0, 4 đòn tấn công bị chặn đúng shield, indexer + SSE không trùng). Chạy local:

```bash
pnpm --filter server build
E2E_DEPLOYMENT=../../packages/contracts/deployments/fork.json \
DATABASE_URL=postgres://agentshield:agentshield@localhost:55432/agentshield_e2e \
REDIS_URL=redis://localhost:56379/15 \
  pnpm --filter server test:integration
```
Cần Anvil "Fuji" ở 8545 và Anvil mô phỏng ở 8546 (fork của 8545). Test tua thời gian chain sang ngày mới: **không bao giờ trỏ vào Fuji thật**.
