# 📜 AgentShield — Contract Spec

> Đặc tả Solidity cho `AgentPolicyModule`. Hợp nhất pseudo-code gốc với các bản sửa C1–C9 trong [`system-design.md` §6](./system-design.md#6-sửa-thiết-kế-smart-contract). **Đây là nguồn duy nhất cho chữ ký hàm, error, event.** Đổi chữ ký ⇒ sửa file này, chạy `pnpm --filter shared gen`, rồi sửa mọi nơi TypeScript báo lỗi.
>
> Trạng thái: **spec** (chưa có code). FS1 chốt các mục đánh dấu ❓ trong tuần 1.

---

## 1. Vai trò & quyền

| Vai trò | Là gì | Được làm |
|---|---|---|
| `owner` | EOA chủ ví (Core/MetaMask) | `setPolicy`, `revoke`, `setLimits`; trên Safe: `enableModule`/`disableModule` |
| `agentSigner` | Session key (EOA) giữ bởi `modules/execution` | Chỉ `executeGuardedSwap` |
| Bất kỳ ai khác | — | Chỉ đọc |

- `owner` của module = EOA chủ ví → Kill-Switch là **1 tx ~1.5s**, không cần luồng ký multisig Safe (C7).
- Lớp kill thứ 2: owner gọi `safe.disableModule()` (qua Safe, chậm hơn).
- ❓ Owner của module và owner của Safe có thể là cùng 1 EOA (Safe 1/1) cho demo. Roadmap: Safe 2/3.

## 2. Storage

```solidity
struct Policy {
    address agentSigner;
    address router;      // Trader Joe V1 router, duy nhất
    uint64  expiry;      // unix seconds
    bool    isActive;    // Kill-Switch đặt false
}
struct Limits { uint128 maxPerTx; uint128 dailyCap; }   // đơn vị nhỏ nhất của token (C1)

ISafe   public immutable safe;
Policy  public policy;
mapping(address token => Limits)                       public limits;       // limits[token].dailyCap == 0 ⇒ token KHÔNG được phép
mapping(address token => mapping(uint256 dayId => uint256)) public spentInDay;
```

- Whitelist token = `limits[token].dailyCap > 0` (một mapping, không cần `allowedTokens` riêng). ❓ FS1 có thể tách nếu muốn rõ nghĩa hơn.
- `dayId = block.timestamp / 1 days` (UTC). Qua ngày mới counter tự về 0.
- Giá trị demo: USDC `maxPerTx = 500e6`, `dailyCap = 1500e6`; WAVAX đặt tương đương giá trị (vd `maxPerTx = 20e18`, `dailyCap = 60e18`).

## 3. Hàm

| Hàm | Ai gọi | Mô tả |
|---|---|---|
| `setPolicy(Policy p, address[] tokens, Limits[] l)` | owner | Ghi policy + limits. Emit `PolicySet`. `p.router != 0`, `p.agentSigner != 0`, `expiry > now` |
| `revoke()` | owner | `policy.isActive = false`. Emit `PolicyRevoked` |
| `executeGuardedSwap(tokenIn, tokenOut, amountIn, minOut, deadline)` | agentSigner | Xem §4 |
| `spentToday(token) → uint256` | view | `spentInDay[token][block.timestamp / 1 days]` (backend/UI đọc cái này, không lưu DB) |

Không có tham số `recipient`, `path`, `approve` ở bất kỳ hàm nào: kẻ tấn công **không có ô để điền** (xem system-design §4).

## 4. `executeGuardedSwap` — các gate

Thứ tự kiểm tra (revert sớm nhất thắng, nên attack 2000 USDC trả `ExceedsPerTxCap`, không phải `ExceedsDailyCap`):

| Gate | Điều kiện | Custom error |
|---|---|---|
| 1 | `msg.sender == policy.agentSigner` | `UnauthorizedAgent` |
| 1 | `policy.isActive` | `PolicyInactive` |
| 1 | `block.timestamp <= policy.expiry` | `PolicyExpired` |
| 2 | `limits[tokenIn].dailyCap > 0 && limits[tokenOut].dailyCap > 0`, `tokenIn != tokenOut` | `TokenNotWhitelisted` / `SameToken` |
| 3 | `amountIn <= limits[tokenIn].maxPerTx` | `ExceedsPerTxCap` |
| 4 | `spentInDay[tokenIn][today] + amountIn <= limits[tokenIn].dailyCap` | `ExceedsDailyCap` |
| – | `minOut > 0` (C3) | `ZeroMinOut` |
| – | `deadline <= block.timestamp + 10 minutes` (C4) | `DeadlineTooFar` |
| 5 | Xem dưới | `SwapFailed` / `InsufficientOutput` / `ResidualAllowance` |

**Gate 5 — thực thi** (mọi call qua `safe.execTransactionFromModule(to, 0, data, Enum.Operation.Call)`, **hard-code `Call`, không bao giờ `DelegateCall`** — C6):
1. `path = [tokenIn, tokenOut]` build **bên trong** module (C2).
2. `balBefore = balanceOf(safe, tokenOut)`.
3. Safe: `tokenIn.approve(router, amountIn)` (exact).
4. Safe: `router.swapExactTokensForTokens(amountIn, minOut, path, address(safe), deadline)`; `recipient` hard-code = Safe.
5. Require `balanceOf(safe, tokenOut) - balBefore >= minOut` (không tin giá trị trả về của router — C9).
6. Require `allowance(safe, router) == 0`; nếu không thì `approve(router, 0)` (C5).
7. `spentInDay[tokenIn][today] += amountIn` — cập nhật state **trước** call ngoài (checks-effects-interactions); revert thì rollback cả.
8. Emit `GuardedSwap`.

Dùng `nonReentrant`. ❓ FS1 xác nhận có cần không (module chỉ gọi Safe/router đã whitelist, nhưng rẻ nên nên có).

## 5. Event

```solidity
event PolicySet(address indexed agentSigner, address router, uint64 expiry, address[] tokens, Limits[] limits);
event PolicyRevoked(address indexed by, uint64 at);
event GuardedSwap(
    address indexed tokenIn, address indexed tokenOut,
    uint256 amountIn, uint256 amountOut,
    uint256 dayId, uint256 spentToday
);
```

Indexer chỉ cần 3 event này (poll `getLogs`, PK `(tx_hash, log_index)`).

## 6. Error → reason code → tiếng Việt

Map đầy đủ nằm ở `packages/shared/src/errors.ts` (AIE sở hữu câu tiếng Việt). Mỗi custom error ở §4 **bắt buộc** có mục tương ứng; test trong `shared` kiểm tra không thiếu.

Revert ngoài module (không phải custom error của ta): Safe `GS104` = "caller không phải module đã enable" (attack #3).

## 7. Test (Foundry)

| Loại | Nội dung |
|---|---|
| Unit | 1 test / gate / custom error, bao gồm biên (`amountIn == maxPerTx`, `== dailyCap`) |
| Fuzz (10,000 runs) | `testFuzz_attackerNeverProfits(amount, caller)`: mọi caller, mọi amount ⇒ số dư attacker = 0 |
| Invariant + Handler | Handler gọi ngẫu nhiên `executeGuardedSwap`, `vm.warp` qua ngày, `revoke`, gọi từ attacker. Invariants: `spentInDay[token][today] <= dailyCap`; attacker balance = 0; sau `revoke` thì `spentInDay` không tăng |
| Fork test Fuji | Swap thật với router TJ + pool đã tạo (kiểm exact approval, allowance = 0 sau swap) |

Slither + checklist: skill `secure-workflow-guide`, chạy trước khi deploy.

## 8. Deploy

`forge script` theo thứ tự: `Deploy.s.sol` (MockUSDC + module) → `SetupPool.s.sol` (addLiquidity cặp MockUSDC/WAVAX trên factory TJ Fuji) → owner `safe.enableModule(module)` → `SetPolicy.s.sol`. Chi tiết lệnh: [`../runbook/setup-and-bringup.md`](../runbook/setup-and-bringup.md).

## 9. Stretch (chỉ làm nếu dư tuần 3)

Chainlink AVAX/USD: module tự tính `minOut ≥ price × amountIn × (1 − maxSlippageBps)`, bỏ phụ thuộc `minOut` do agent gửi. Thêm `maxSlippageBps` vào `Policy`.
