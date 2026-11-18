# 🏭 Chạy production (A7)

> D14: toàn bộ demo chạy bằng `docker compose` trên một laptop, không VPS, không TLS, không domain. Video demo là phương án dự phòng.
> Khác với dev (`infra/docker-compose.yml` chỉ có hạ tầng, api/worker chạy bằng `pnpm dev`), file prod build và chạy **cả 7 service**.

## 1. Chuẩn bị (1 lần)

1. Docker Desktop đang chạy.
2. L4 đã deploy xong: có `packages/contracts/deployments/fuji.json` (xem [`deploy-fuji.md`](./deploy-fuji.md)).
3. Tạo file env (file **duy nhất** của prod, đã gitignore):
   ```bash
   pnpm env:prod        # tạo infra/.env.prod, tự sinh SESSION_SECRET, POSTGRES_PASSWORD, WEB_PROXY_SECRET
   ```
   Chạy lại an toàn: chỉ điền secret còn trống, không bao giờ đổi giá trị đã có (trừ `--rotate-session`: sinh `SESSION_SECRET` mới, mọi người đăng nhập lại). Script không in secret ra màn hình. Rồi tự điền theo bảng dưới. **Không bao giờ để key owner/deployer ở đây.**

| Biến | Điền |
|---|---|
| `AGENT_PRIVATE_KEY` | Key **session** của ví agent (L4 bước 0). Nạp ~0.5 AVAX Fuji cho gas |
| `ADMIN_ADDRESSES` | Ví người thuyết trình (mở drawer Admin để bật Demo mode, §4c). **Bắt buộc cho buổi demo** |
| `SIWE_DOMAINS` | Domain Vercel khi web chạy Vercel (§2b); để trống khi dùng nginx `localhost:8080` |
| `GEMINI_API_KEY`, `TELEGRAM_*` | Tuỳ chọn |

Mọi giá trị công khai **không cần điền**, đã có mặc định trong code: địa chỉ contract + block bắt đầu của indexer (`packages/shared/src/deployments.ts`, khớp `fuji.json`, test kiểm), 3 RPC Fuji công khai (PublicNode, dRPC, RPC chính thức; L10: chỉ RPC chính thức là không đủ vì nó trả Cloudflare 429 cho Docker), địa chỉ agent cho watchdog, các giới hạn. Muốn đổi thì thêm dòng vào `.env.prod`, ví dụ `FUJI_RPC_URLS=<RPC riêng>,https://avalanche-fuji-c-chain-rpc.publicnode.com`; danh sách biến ghi đè được nằm trong `infra/docker-compose.prod.yml`.

## 2. Chạy

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build --wait
```

Mở `http://localhost:8080` (đổi bằng `WEB_PORT`). Chỉ cổng web được mở ra máy; postgres, redis, anvil, api nằm trong mạng nội bộ của compose.

Kiểm tra (chỉ đọc, L10), phải ra `0 FAIL`:

```bash
pnpm seed --verify --api http://localhost:8080 --web http://localhost:8080 --env infra/.env.prod
```

> ⚠️ Chỉ một worker được ký bằng key agent (P4). Đang chạy prod thì tắt worker của stack dev (`start.bat`), nếu không hai bên tranh nonce.

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

## 2b. Web trên Vercel, server chạy compose (deploy thật cho giám khảo)

Web tĩnh trên Vercel; server (api, worker, postgres, redis, anvil) chạy bằng compose ở mục 2 và được mở ra internet bằng một tunnel. Trình duyệt chỉ thấy **một domain** (Vercel): `/api/*` đi qua proxy `apps/web/api/proxy.ts` (Edge Function) tới server, nên cookie đăng nhập SIWE và SSE chạy không cần CORS. Không cần sửa code, chỉ điền biến.

**Chưa có server:** đặt `VITE_DATA_SOURCE=mock` trên Vercel → web chạy **mock** (giả lập trong trình duyệt, sign-in bằng địa chỉ giả, không chạm chain). Đừng đưa link mock cho giám khảo mà không ghi rõ. Không đặt gì thì web chạy **live** (mặc định), nên bản build production không bao giờ vô tình phục vụ mock.

1. **Mở server ra internet** (compose đang chạy, web nginx ở `localhost:8080`):
   ```bash
   cloudflared tunnel --url http://localhost:8080      # in ra https://<tên>.trycloudflare.com
   ```
   Quick tunnel đổi URL mỗi lần chạy. Muốn cố định thì dùng named tunnel với domain riêng.
2. **`infra/.env.prod`** (rồi `up -d` lại api):
   | Biến | Giá trị |
   |---|---|
   | `SIWE_DOMAINS` | domain Vercel, ví dụ `agentshield.vercel.app` (thêm domain riêng nếu có, phân cách bằng dấu phẩy) |
   | `WEB_PROXY_SECRET` | `pnpm env:prod` đã sinh sẵn; copy giá trị này sang Vercel ở bước 3 |
3. **Vercel → Project → Settings → Environment Variables** (Root Directory = `apps/web`). Chỉ 2 biến bắt buộc:
   | Biến | Giá trị | Loại |
   |---|---|---|
   | `API_ORIGIN` | URL tunnel ở bước 1, **không** có `/api`, không có `/` cuối | server (chỉ Edge Function đọc) |
   | `WEB_PROXY_SECRET` | giống hệt `infra/.env.prod` | server |
   | `VITE_WALLETCONNECT_PROJECT_ID` | tuỳ chọn: project id miễn phí ở cloud.reown.com; không có thì điện thoại không có extension không đăng nhập được | build (vào bundle) |

   Không cần `VITE_DATA_SOURCE` (mặc định `live`) hay địa chỉ contract (web lấy từ `packages/shared`).
4. **Redeploy** trên Vercel (biến `VITE_*` chỉ vào bundle lúc build; đổi `API_ORIGIN` cũng cần deploy lại).
5. **Kiểm tra:** `https://<domain>/api/health` ra `"status":"ok"`; vào `/signin` phải mở ví thật và xin chữ ký (bản mock thì vào thẳng bằng địa chỉ giả); `/vaults` hiện vault thật.

Ghi chú:
- **Giới hạn ghi theo IP:** qua Vercel mọi người dùng đến từ IP của Vercel. Proxy gửi kèm IP thật + `WEB_PROXY_SECRET`; server chỉ tin IP đó khi secret khớp (`configure-api.ts`, `trustWebProxy`), nên không ai giả IP bằng cách gọi thẳng server. Thiếu secret thì cả lớp giám khảo chung một hạn mức 10 lần/phút.
- **SSE qua Edge Function** có giới hạn thời gian của Vercel: khi bị cắt, web tự nối lại và poll 2 s trong lúc chờ, nên vẫn cập nhật.
- `/api/proxy` trả `503` problem+json khi `API_ORIGIN` chưa đặt hoặc sai dạng.
- Bản Docker `web` (nginx, mục 2) mặc định build **live** (`VITE_DATA_SOURCE=live` trong `web.Dockerfile`), không còn rơi về mock.

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
2. Điền 2 biến đó trong `.env.prod`. Địa chỉ ví agent (`AGENT_ADDRESS`, không phải key) đã mặc định là `agent` trong `fuji.json`.
3. Thêm `--profile monitoring` vào lệnh ở mục 2.

Không có token thì watchdog chỉ ghi log (`docker compose ... logs watchdog`).

## 4b. Chống lạm dụng (A9)

Vault demo công khai không cần đăng nhập (D12), nên hai endpoint ghi `POST /vaults/{safe}/jobs` và `/attacks` bị giới hạn (đếm trong Redis):

| Giới hạn | Mặc định | Vượt → |
|---|---|---|
| Mỗi IP | `WRITE_LIMIT_PER_IP=10` lần / `WRITE_IP_WINDOW_MS=60000` | `429 RATE_LIMITED` |
| Vault demo, mọi người cộng lại | 1 lần / `DEMO_WRITE_COOLDOWN_MS=5000` | `429 COOLDOWN` |
| Vault khác, theo (vault, endpoint) | 1 lần / `WRITE_COOLDOWN_MS=2000` | `429 COOLDOWN` |
| Gas của agent | < `AGENT_MIN_GAS_WEI` (0.02 AVAX) | `503 AGENT_LOW_GAS` |

429 kèm `Retry-After` (giây). Đặt `0` để tắt một giới hạn. **Trước giờ diễn** trên vault sân khấu có thể giảm cooldown để bấm liên tục. IP lấy từ nginx (ghi đè `X-Forwarded-For`, client không giả được). 
## 4c. Đăng nhập (SIWE) và quyền (A9)

Khách dùng vault demo không cần đăng nhập (D12). Owner và admin ký một message EIP-4361 bằng ví → cookie `session` (httpOnly, SameSite=Lax, hết hạn sau `SESSION_TTL_S`, mặc định 12h).

| Ai | Được làm |
|---|---|
| Khách | Đọc mọi thứ; `POST /jobs`, `/attacks` **chỉ trên vault demo** (có throttle, §4b) |
| Owner (có trong `Safe.getOwners()` trên chain, cache 30s) | Thêm `POST /jobs`, `/attacks` trên vault của mình. Không phải owner → `403 NOT_OWNER` |
| Admin (`ADMIN_ADDRESSES`) | Drawer Admin (`/api/v1/admin/rebalancer`: tạm dừng rebalancer = Demo mode) và Bull Board (`/api/v1/admin/queues`) |

- Đổi `ADMIN_ADDRESSES` thì restart `api` (env chỉ đọc lúc khởi động). Role tính lại ở mỗi `GET /auth/session`, nên sau đó chỉ cần reload trang, không phải ký lại.

- `SESSION_SECRET` bắt buộc ở production (`openssl rand -hex 32`); đổi nó là đăng xuất tất cả.
- Phiên chỉ chứng minh **địa chỉ ví**. Role tính lại từ chain và allowlist mỗi request; setPolicy/Kill-Switch vẫn ký trong browser (P2).
- `SIWE_DOMAINS` để trống khi chạy sau nginx (Host được giữ cả cổng). Dev qua Vite: `localhost:5173`.

## 5. Sự cố

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| `worker` khởi động lại liên tục | Thiếu `AGENT_PRIVATE_KEY`: production cố ý không chạy bản giả |
| compose báo `set POSTGRES_PASSWORD` / `set SESSION_SECRET` | Chưa chạy `pnpm env:prod`, hoặc quên `--env-file infra/.env.prod` |
| Health `rpc: down` | RPC Fuji lỗi: thêm RPC dự phòng vào `FUJI_RPC_URLS` |
| Job `rejected` `UnauthorizedAgent` | Key trong env không phải agent của policy (`AGENT_ADDRESS` lúc deploy) |
| Indexer log `block range too large` | Giảm `INDEXER_MAX_SPAN` (RPC public Fuji cho tối đa 100) |
| `429 COOLDOWN` khi demo | Chờ vài giây, hoặc giảm `DEMO_WRITE_COOLDOWN_MS` / `WRITE_COOLDOWN_MS` |
| `503 AGENT_LOW_GAS` | Nạp AVAX Fuji cho ví agent (faucet), chờ ~15s cache |
| Đăng nhập báo `Message issued for ...` | Domain trong message khác host của API: đặt `SIWE_DOMAINS` đúng host[:port] trình duyệt đang mở |
| `api` không khởi động: `SESSION_SECRET: required` | Điền `SESSION_SECRET` (32+ ký tự) trong `.env.prod` |
| Cổng 8080 bị chiếm | Đặt `WEB_PORT=8090` trong `.env.prod` |

## 6. Diễn tập không cần Fuji

Chạy được nguyên stack trên Anvil local (dùng để kiểm trước khi L4 deploy):
1. `docker compose -f infra/docker-compose.yml up -d --wait` (Anvil A = "Fuji").
2. Deploy bằng script L4 với key dev của Anvil (`DEPLOYMENT=fork`, như job CI `deploy-dry-run`).
3. Trong `infra/.env.prod`: `FUJI_RPC_URLS=FORK_URL=http://host.docker.internal:8545`, key agent = Anvil #1, và **ghi đè** cả 6 biến địa chỉ (`SAFE_ADDRESS`, `POLICY_MODULE_ADDRESS`, `TOKEN_A_ADDRESS`, `TOKEN_B_ADDRESS`, `FACTORY_ADDRESS`, `INDEXER_START_BLOCK`) bằng `deployments/fork.json`, nếu không server dùng mặc định Fuji.
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
