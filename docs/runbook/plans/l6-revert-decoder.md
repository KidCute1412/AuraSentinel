# Plan L6: revert-decoder (custom error, GS104, lỗi router → reason code)

> **Trạng thái:** plan đã duyệt nội dung, **chưa triển khai** (12/11/2026). Người làm L6 đọc file này trước, kiểm lại các giả định (đặc biệt chuỗi lỗi router và code simulator) vì code có thể đã đổi.

## Context
L6 (hạn 13/11, P0). Điều kiện xong: "Mỗi error map đúng; selector lạ → UNKNOWN_REVERT". Decoder đã có từ A4/A5 (`apps/server/src/core/chain/revert-decoder.ts`, 44 dòng), xử lý custom error của module, `Error("GS###")` và fallback. Khi đọc kỹ thì còn 3 lỗ hổng:

1. **Decoder dùng ABI viết tay, thiếu 5 error.** `apps/server/src/core/chain/abis.ts` (ghi chú "TEMPORARY until L1") chỉ có 12 error của gate. `NotOwner`, `InvalidPolicy`, `Reentrancy` (module) và `NotSafeOwner`, `ModuleExists` (factory) đều bị decode thành `UNKNOWN_REVERT`, dù `REASONS` đã có câu giải thích. L1 đã sinh ABI thật vào `packages/shared/src/generated/abis.ts` (`agentPolicyModuleAbi`, `agentShieldFactoryAbi`).
2. **Chưa map lỗi router Trader Joe.** Decode `Error(string)` hiện chỉ khớp được khi chuỗi trùng tên một reason code.
3. **Lỗi router không bao giờ đến được decoder.** Safe v1.4.1 `execTransactionFromModule` chỉ trả `false` khi lệnh con lỗi, không kèm lý do, nên module đổi thành `SwapFailed`. Nếu chỉ map chuỗi thì phần map đó không bao giờ được dùng. Cách giải: khi simulator gặp `SwapFailed`, nó **chẩn đoán** trên fork bằng cách giả làm Safe gọi thẳng router để lấy lý do thật.

Chuỗi lỗi lấy từ **bytecode thật trên Fuji** (router `0xd7f6…A901` và một pair của factory `0xF5c7…7C2C`), không dựa vào trí nhớ:
- Router: `JoeRouter: EXPIRED`, `JoeRouter: INSUFFICIENT_OUTPUT_AMOUNT`, `JoeRouter: INVALID_PATH`, `JoeRouter: EXCESSIVE_INPUT_AMOUNT`, `JoeRouter: INSUFFICIENT_A_AMOUNT/B_AMOUNT`, `JoeLibrary: INSUFFICIENT_LIQUIDITY`, `JoeLibrary: INSUFFICIENT_INPUT_AMOUNT`, `JoeLibrary: INSUFFICIENT_OUTPUT_AMOUNT`, `JoeLibrary: INSUFFICIENT_AMOUNT`, `JoeLibrary: IDENTICAL_ADDRESSES`, `JoeLibrary: ZERO_ADDRESS`, `TransferHelper: TRANSFER_FROM_FAILED`, `TransferHelper: TRANSFER_FAILED`, `TransferHelper: AVAX_TRANSFER_FAILED`
- Pair: `Joe: K`, `Joe: INSUFFICIENT_OUTPUT_AMOUNT`, `Joe: INSUFFICIENT_INPUT_AMOUNT`, `Joe: INSUFFICIENT_LIQUIDITY`, `Joe: INVALID_TO`, `Joe: OVERFLOW`, `Joe: LOCKED`…

## Quyết định (và lý do)
1. **7 reason code mới, nhóm theo việc người dùng cần biết.** Tên SCREAMING_SNAKE vì chỉ có off-chain (đúng quy ước trong `errors.ts`). Thêm `kind: 'router'` vào `ReasonKind`.

   | Code | Chuỗi gốc | Nghĩa |
   |---|---|---|
   | `ROUTER_SLIPPAGE` | `JoeRouter: INSUFFICIENT_OUTPUT_AMOUNT` | Giá đã chạy, nhận về ít hơn minOut |
   | `ROUTER_NO_LIQUIDITY` | `*: INSUFFICIENT_LIQUIDITY`, hoặc pool chưa tồn tại | Pool rỗng hoặc chưa có |
   | `ROUTER_AMOUNT_TOO_SMALL` | `JoeLibrary: INSUFFICIENT_INPUT_AMOUNT/AMOUNT`, `Joe: INSUFFICIENT_INPUT/OUTPUT_AMOUNT` | Lệnh quá nhỏ, làm tròn về 0 |
   | `ROUTER_TRANSFER_FAILED` | `TransferHelper: *` | Két không đủ số dư để chuyển |
   | `ROUTER_EXPIRED` | `JoeRouter: EXPIRED` | Hết hạn chót trước khi khớp |
   | `ROUTER_INVALID_PATH` | `JoeRouter: INVALID_PATH`, `JoeLibrary: IDENTICAL_ADDRESSES/ZERO_ADDRESS` | Cặp token sai |
   | `ROUTER_REJECTED` | Mọi chuỗi khác có tiền tố `JoeRouter:`, `JoeLibrary:`, `Joe:`, `TransferHelper:` (vd `Joe: K`) | Sàn từ chối, lý do khác |

   Chuỗi không có các tiền tố trên vẫn trả `UNKNOWN_REVERT`, và `Panic(uint256)` cũng vậy.
2. **Bảng chuỗi → code đặt ở server** (`core/chain/revert-decoder.ts`, hàm thuần `routerReasonCode`). Đây là kiến thức về chain. `packages/shared` chỉ giữ code và câu chữ (VI trong `REASONS`, EN trong `apps/web/src/shared/lib/reasonCopy.ts`; test bắt buộc hai bảng cùng bộ code).
3. **Decoder dùng ABI sinh từ L1, module và factory gộp lại.** Đổi `POLICY_MODULE_ABI` trong `abis.ts` thành re-export `agentPolicyModuleAbi`, bỏ ABI viết tay. Lý do: mọi chỗ đang dùng (simulator, tx-sender, redteam) được ABI đầy đủ, hết rủi ro lệch selector như ghi chú cảnh báo. ABI sinh ra là `as const` nên viem suy kiểu như cũ, `typecheck` sẽ bắt nếu có gì lệch.
4. **Simulator chẩn đoán `SwapFailed`** (`AnvilSimulator.execute`, chỉ chạy khi eth_call module trả `SwapFailed`, nằm trong mutex trước `rollback()` nên mọi thay đổi trên fork đều được hoàn tác):
   1. `router.factory()` → `getPair(tokenIn, tokenOut)`. Pair bằng 0 thì trả `ROUTER_NO_LIQUIDITY` (gọi pair không tồn tại sẽ revert không có data, nên phải kiểm trước).
   2. Giả làm Safe (`impersonateAccount`, `setBalance` gas), gửi `approve(router, amountIn)` từ Safe.
   3. `eth_call` `swapExactTokensForTokens(amountIn, minOut, [in, out], safe, deadline)` từ Safe, **cùng deadline** với lệnh gọi module. Revert thì đưa qua `decodeRevert`, ra `ROUTER_*` thì dùng code đó.
   4. Mọi trường hợp khác (call thành công, lỗi hạ tầng, code không phải `ROUTER_*`) đều giữ nguyên `SwapFailed`, nên kết quả **không bao giờ tệ hơn hiện tại**. Luôn `stopImpersonatingAccount` trong `finally`.

   Simulator trả code cụ thể thay cho `SwapFailed`. tx-sender (on-chain) vẫn trả `SwapFailed`, vì RPC công khai không cho giả làm Safe. Hai đường khác nhau là có chủ đích và sẽ ghi vào docs.
5. **Không đụng contract, không đụng ABI.**

## Các thay đổi

### `packages/shared/src/errors.ts`
- `ReasonKind` thêm `'router'`.
- 7 entry `ROUTER_*` (title không có số, `messageVi` ≤ 280 ký tự, đều nói rõ "không có tiền nào rời két"; dùng placeholder `{minOut}` cho `ROUTER_SLIPPAGE`, kèm `fallbackVi`).
- Cập nhật comment quy ước đặt tên: router = SCREAMING_SNAKE, có tiền tố `ROUTER_`.
- `packages/shared/test/reasons.spec.ts`: thêm test "có đủ 7 code router với kind `router`".

### `apps/web/src/shared/lib/reasonCopy.ts`
- 7 entry tiếng Anh tương ứng (`Record<ReasonCode, …>` sẽ báo lỗi kiểu nếu thiếu). Test có sẵn sẽ kiểm cùng placeholder và có fallback.
- Grep thêm `kind` trong `apps/web` để chỗ nào switch theo `ReasonKind` xử lý được `'router'`.

### `apps/server/src/core/chain/abis.ts`
- `POLICY_MODULE_ABI = agentPolicyModuleAbi`, thêm `FACTORY_ABI = agentShieldFactoryAbi` (import từ `@agentshield/shared`). Bỏ ghi chú TEMPORARY.
- Thêm `JOE_ROUTER_ABI` (`factory()`, `swapExactTokensForTokens`) và `JOE_FACTORY_ABI` (`getPair`) viết tay, ghi nguồn là Trader Joe V1 trên Fuji.

### `apps/server/src/core/chain/revert-decoder.ts`
- `DECODE_ABI` = module + factory errors.
- `routerReasonCode(message): ReasonCode | undefined`: bảng khớp chính xác trước, sau đó khớp theo tiền tố thì trả `ROUTER_REJECTED`.
- `decodeRevert`: `Error(string)` đi theo thứ tự GS → router → `toReasonCode`, rồi đến `UNKNOWN_REVERT`. Giữ nguyên `extractRevertData`.
- Export `ROUTER_REVERT_STRINGS` để test duyệt hết.

### `apps/server/src/modules/simulation/adapters/anvil.simulator.ts`
- Hàm private `diagnoseSwapFailed(intent, target, router, deadline)` theo quyết định 4. Lưu `deadline` một lần để lệnh gọi module và lệnh chẩn đoán dùng cùng giá trị.
- Log debug: `SwapFailed diagnosed as ROUTER_SLIPPAGE`.

### Tests
- `revert-decoder.spec.ts`:
  - Mọi error trong ABI module và factory (17 cái) map về đúng tên. Duyệt ABI sinh ra, không phải danh sách viết tay.
  - Mỗi chuỗi trong `ROUTER_REVERT_STRINGS` (đúng chuỗi lấy từ bytecode) map về code mong đợi.
  - `Joe: K` và chuỗi lạ có tiền tố map về `ROUTER_REJECTED`. Chuỗi không có tiền tố, `Panic(0x11)`, selector lạ `0xdeadbeef`, data rỗng và lỗi không có data đều map về `UNKNOWN_REVERT`.
  - Data nằm sâu trong chuỗi `cause` với lỗi router vẫn decode được.
- `anvil.simulator.spec.ts` (fake client có sẵn, mở rộng `call` theo `to`):
  - Module `SwapFailed` + router `INSUFFICIENT_OUTPUT_AMOUNT` → `ROUTER_SLIPPAGE`, không mine, đã rollback, đã stop impersonate Safe.
  - `getPair` = 0 → `ROUTER_NO_LIQUIDITY`.
  - Router call thành công → giữ `SwapFailed`.
  - Lỗi hạ tầng khi chẩn đoán → giữ `SwapFailed`.
  - Custom error khác (`ExceedsPerTxCap`) → không chạy chẩn đoán.

### Docs
- `docs/architecture/contracts.md` (đoạn reason code): bảng chuỗi router → code, giới hạn Safe nuốt lý do lỗi, và việc simulator chẩn đoán còn tx-sender thì không.
- `docs/runbook/tasks.csv`: L6 sang Review, ghi lại phạm vi đã làm.

## Verification
1. `pnpm --filter @agentshield/shared test`, `pnpm --filter server test`, `pnpm --filter web test`, và `pnpm turbo run lint typecheck` cho shared, server, web.
2. **End-to-end trên Anvil fork Fuji thật** (script tạm trong scratchpad, không commit):
   - `anvil --fork-url <fuji>`, chạy Deploy, SetupPool, CreateVault trên fork với `DEPLOYMENT=fork` (CreateVault dùng `FUND_USDC=100e6`).
   - Gọi `AnvilSimulator.simulate`:
     - `minAmountOut` gấp đôi giá quote → kỳ vọng `ROUTER_SLIPPAGE`.
     - `amountIn` 200 USDC (> 100 trong két, < cap 500) → kỳ vọng `ROUTER_TRANSFER_FAILED`.
     - Lệnh hợp lệ → `ok`.
   - Kiểm fork không đổi sau sim (số dư Safe, allowance, nonce).
3. `forge test` không cần chạy lại vì không đụng `packages/contracts`.
