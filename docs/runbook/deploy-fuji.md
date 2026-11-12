# 🚀 Deploy lên Fuji (L4)

> Chạy trên **máy của owner**, không chạy trên server hay cloud: key deployer/owner không bao giờ nằm trong file env hay repo (P5). Các script đã chạy thử nguyên quy trình trên Anvil fork của Fuji trong CI (job `deploy-dry-run`), nên lệnh dưới đây là cùng một chuỗi bước.
>
> Kết quả: `packages/contracts/deployments/fuji.json` (commit file này) chứa mọi địa chỉ.

## 0. Chuẩn bị (1 lần)

| Cần | Cách lấy |
|---|---|
| Foundry | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Ví **owner** (cũng là deployer) | Ví Core/MetaMask của bạn. Cần khoảng **1–2 AVAX Fuji** cho phí gas (faucet: <https://core.app/tools/testnet-faucet>) |
| Ví **agent** (session key) | Ví mới, chỉ dùng cho agent. Cần khoảng **0.5 AVAX Fuji** cho gas. Key này sau đó vào `AGENT_PRIVATE_KEY` của worker |

Import 2 key vào keystore của Foundry (mã hoá bằng mật khẩu, không lưu key dạng chữ):

```bash
cast wallet import deployer --interactive   # dán private key của ví owner
cast wallet import agent --interactive      # dán private key của ví agent
cast wallet address --account agent         # ghi lại địa chỉ agent
```

```bash
cd packages/contracts
git submodule update --init
forge build
export DEPLOYMENT=fuji
export AGENT_ADDRESS=0x...                  # địa chỉ ví agent ở trên
```

Mọi lệnh dưới đây thêm `--slow` để Fuji xác nhận từng tx trước khi gửi tx tiếp theo.

## 1. Token + factory

```bash
forge script script/Deploy.s.sol --rpc-url fuji --account deployer --broadcast --slow
```

Deploy `MockUSDC` (1,000,000 USDC cho ví owner, faucet 5,000/giờ), `MockWAVAX` (100,000 WAVAX, faucet 200/giờ), `AgentShieldFactory`. Ghi `deployments/fuji.json`. Chạy lại sẽ bị chặn nếu file đã có (đặt `FORCE=true` nếu thật sự muốn deploy lại từ đầu).

> **Vì sao MockWAVAX?** WAVAX thật phải xin từ faucet, mỗi ngày chỉ vài AVAX, không đủ làm pool sâu. Pool mỏng thì swap 500 USDC làm giá lệch mạnh. Module không quan tâm token nào: chỉ cần 2 token trong whitelist.

## 2. Pool Trader Joe

```bash
forge script script/SetupPool.s.sol --rpc-url fuji --account deployer --broadcast --slow
```

Tạo pool MockUSDC/MockWAVAX trên router Trader Joe V1 (`0xd7f6…A901`) với 400,000 USDC + 16,000 WAVAX (1 WAVAX = 25 USDC). Swap 500 USDC lệch giá khoảng 0.25%.

## 3. Hai vault demo

```bash
VAULT=public forge script script/CreateVault.s.sol --rpc-url fuji --account deployer --broadcast --slow
VAULT=stage  forge script script/CreateVault.s.sol --rpc-url fuji --account deployer --broadcast --slow
```

Mỗi lệnh: tạo Safe v1.4.1 (1 owner = ví của bạn) → `factory.deployModule` → `enableModule` → `setPolicy` (USDC 500/tx, 1,500/ngày; WAVAX 20/60; hạn 30 ngày) → nạp 10,000 USDC + 400 WAVAX vào Safe.

- `public`: vault công khai, luôn bật (D15).
- `stage`: vault cho demo trực tiếp; trước giờ diễn owner ký `setPolicy` trên web để reset ngân sách.

## 4. Swap thủ công (điều kiện nghiệm thu L4)

```bash
VAULT=public forge script script/ManualSwap.s.sol --rpc-url fuji --account agent --broadcast --slow
```

Ký bằng **ví agent**. Swap 100 USDC → WAVAX qua module. Script kiểm: USDC của Safe giảm đúng 100, WAVAX tăng ≥ minOut, allowance còn lại = 0. Link tx hiện trong log: mở `https://testnet.snowtrace.io/tx/<hash>`.

## 5. Verify trên Snowtrace

Testnet không cần API key thật (Routescan). Lấy địa chỉ trong `deployments/fuji.json`:

```bash
forge verify-contract <usdc>    src/MockUSDC.sol:MockUSDC           --chain fuji --constructor-args $(cast abi-encode "f(uint256,uint256,uint256)" 1000000000000 5000000000 3600) --watch
forge verify-contract <wavax>   src/MockWAVAX.sol:MockWAVAX         --chain fuji --constructor-args $(cast abi-encode "f(uint256,uint256,uint256)" 100000000000000000000000 200000000000000000000 3600) --watch
forge verify-contract <factory> src/AgentShieldFactory.sol:AgentShieldFactory --chain fuji --watch
forge verify-contract <publicModule> src/AgentPolicyModule.sol:AgentPolicyModule --chain fuji --constructor-args $(cast abi-encode "f(address,address)" <publicSafe> <owner>) --watch
forge verify-contract <stageModule>  src/AgentPolicyModule.sol:AgentPolicyModule --chain fuji --constructor-args $(cast abi-encode "f(address,address)" <stageSafe> <owner>) --watch
```

Safe proxy không cần verify (Snowtrace nhận ra proxy của Safe v1.4.1).

## 6. Sau khi xong

1. Commit `packages/contracts/deployments/fuji.json`.
2. Điền env server (`apps/server/.env`): `SAFE_ADDRESS` = `publicSafe`, `POLICY_MODULE_ADDRESS` = `publicModule`, `TOKEN_A_ADDRESS` = `usdc`, `TOKEN_B_ADDRESS` = `wavax`, `AGENT_PRIVATE_KEY` = key ví agent.
3. Thay địa chỉ giả trong `apps/web/src/features/proof/proof.ts` (L9).

## Sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| `Deploy: deployment file exists` | Đã deploy rồi. Chỉ dùng `FORCE=true` nếu muốn bỏ toàn bộ deployment cũ |
| `CreateVault: vault already in the file` | Vault đó đã tạo. Muốn tạo lại: xoá 2 trường của vault đó trong `fuji.json` (đặt về `0x000…0`) và thêm `SALT=1` |
| `insufficient funds for gas` | Xin thêm AVAX Fuji cho ví đang ký |
| `ManualSwap: sign with the agent key` | Lệnh swap phải dùng `--account agent`, không phải `deployer` |
| Script dừng giữa chừng | Chạy lại đúng bước đó: mỗi bước đọc và ghi lại `fuji.json` |
