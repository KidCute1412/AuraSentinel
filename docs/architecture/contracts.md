# 📜 AgentShield — Contract Spec

> Đặc tả Solidity cho `AgentPolicyModule`. Hợp nhất pseudo-code gốc với các bản sửa C1–C9 trong [`system-design.md` §6](./system-design.md#6-sửa-thiết-kế-smart-contract). **Đây là nguồn duy nhất cho chữ ký hàm, error, event.** Đổi chữ ký ⇒ sửa file này, chạy `pnpm --filter shared gen`, rồi sửa mọi nơi TypeScript báo lỗi.
>
> Trạng thái: **đã có code** ở `packages/contracts` (L1 + L2, 10/11). Ba mục ❓ đã chốt bên dưới (ghi **Chốt**). Factory và MockUSDC mới có interface (`src/interfaces/`), phần cài đặt là L3.

---

## 1. Vai trò & quyền

| Vai trò | Là gì | Được làm |
|---|---|---|
| `owner` | EOA chủ ví (Core/MetaMask) | `setPolicy`, `revoke`, `setLimits`; trên Safe: `enableModule`/`disableModule` |
| `agentSigner` | Session key (EOA) giữ bởi `modules/execution` | Chỉ `executeGuardedSwap` |
| Bất kỳ ai khác | — | Chỉ đọc |

- `owner` của module = EOA chủ ví → Kill-Switch là **1 tx ~1.5s**, không cần luồng ký multisig Safe (C7).
- Lớp kill thứ 2: owner gọi `safe.disableModule()` (qua Safe, chậm hơn).
- **Chốt (D9):** owner của module và owner của Safe có thể là cùng 1 EOA (Safe 1/1) cho demo; factory kiểm `ISafe.isOwner(msg.sender)` và đặt người gọi làm `owner` (immutable, không có hàm đổi owner). Roadmap: Safe 2/3.

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
address public immutable owner;
Policy  public policy;
uint256 public policyEpoch;                                   // +1 mỗi lần setPolicy (D10)
mapping(address token => Limits) public limits;               // limits[token].dailyCap == 0 ⇒ token KHÔNG được phép
address[] private _tokens;                                    // danh sách whitelist hiện tại, tối đa MAX_TOKENS = 16
mapping(uint256 epoch => mapping(address token => mapping(uint256 dayId => uint256))) private _spent;
```

`spentInDay(token, dayId)` và `spentToday(token)` là view đọc `_spent[policyEpoch]`; `whitelistedTokens()` trả `_tokens`. Policy mới ⇒ epoch mới ⇒ ngân sách về 0 (reset sandbox, kích hoạt lại sau Kill) mà không cần xoá storage.

- Whitelist token = `limits[token].dailyCap > 0` (một mapping, không cần `allowedTokens` riêng). **Chốt:** không tách; `_tokens` chỉ để `setPolicy` xoá sạch limits cũ.
- `dayId = block.timestamp / 1 days` (UTC). Qua ngày mới counter tự về 0.
- Giá trị demo: USDC `maxPerTx = 500e6`, `dailyCap = 1500e6`; WAVAX đặt tương đương giá trị (vd `maxPerTx = 20e18`, `dailyCap = 60e18`).

## 3. Hàm

| Hàm | Ai gọi | Mô tả |
|---|---|---|
| `setPolicy(Policy p, address[] tokens, Limits[] l)` | owner | Thay toàn bộ policy + limits, `policyEpoch++`, emit `PolicySet`. Revert `InvalidPolicy` nếu: `agentSigner`/`router` = 0, `expiry <= now`, hai mảng lệch độ dài, quá 16 token, token = 0 hoặc trùng, `maxPerTx == 0`, `dailyCap == 0`, hoặc `maxPerTx > dailyCap`. Token không còn trong danh sách bị xoá khỏi whitelist. Đặt `p.isActive = true` để kích hoạt lại sau Kill |
| `revoke()` | owner | `policy.isActive = false` (Kill-Switch). Emit `PolicyRevoked`. Idempotent |
| `executeGuardedSwap(tokenIn, tokenOut, amountIn, minOut, deadline)` | agentSigner | Xem §4 |
| `spentToday(token) → uint256` | view | Đã dùng hôm nay trong epoch hiện tại (backend/UI đọc cái này, không lưu DB) |
| `spentInDay(token, dayId)`, `whitelistedTokens()`, `policyEpoch()`, `owner()`, `safe()` | view | Đọc state |

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

Dùng `nonReentrant` (revert `Reentrancy`). **Chốt:** có; router là contract ngoài nên guard rẻ mà chắc.

Gas: `executeGuardedSwap` đo ~273k với router mock. Router Trader Joe thật tốn thêm; server đặt `SWAP_GAS = 700_000`, cần đo lại ở fork test (L4/L5) để chắc còn dư.

## 5. Event

```solidity
event PolicySet(address indexed agentSigner, uint256 epoch, address router, uint64 expiry, bool isActive, address[] tokens, Limits[] limits);
event PolicyRevoked(address indexed by, uint64 at);
event GuardedSwap(
    address indexed tokenIn, address indexed tokenOut,
    uint256 amountIn, uint256 amountOut,
    uint256 dayId, uint256 spentToday
);
```

`epoch` là `policyEpoch` sau khi ghi (D10). Indexer chỉ cần 3 event này của module (poll `getLogs`, PK `(tx_hash, log_index)`) cộng `ModuleDeployed(safe, module, owner)` của factory.

## 6. Error → reason code → tiếng Việt

Map đầy đủ nằm ở `packages/shared/src/errors.ts` (AIE sở hữu câu tiếng Việt). Mỗi custom error ở §4 **bắt buộc** có mục tương ứng; test trong `shared` kiểm tra không thiếu.

Ngoài 12 error của §4, module có thêm 3 error cho owner và guard: `NotOwner`, `InvalidPolicy`, `Reentrancy`; factory có `NotSafeOwner`, `ModuleExists`. Agent không bao giờ gặp chúng trong pipeline swap, nhưng wizard và Policy panel cần giải thích khi ví ký sai, nên cũng có mục trong `REASONS`.

Revert ngoài module (không phải custom error của ta): Safe `GS104` = "caller không phải module đã enable" (attack #3).

Quy ước tên reason code (`REASONS` trong `errors.ts`): **PascalCase** = custom error của module (precheck và sim mirror gate thì trả đúng tên này) · **`GS###`** = lỗi Safe · **SCREAMING_SNAKE** = chỉ có off-chain (`RECIPIENT_NOT_SAFE`, `INVARIANT_*`, `UNKNOWN_REVERT`). Câu tiếng Việt lấy qua `formatReasonVi(code, params)`; thiếu số thì tự dùng câu không số, mã lạ thì về `UNKNOWN_REVERT`. `packages/contracts/abi/` đã có ABI; test `reasons.spec.ts` fail nếu một error trong ABI chưa có mục.

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
