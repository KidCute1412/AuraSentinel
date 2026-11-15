# Phần on-chain của AgentShield: câu chuyện để hiểu (track L, Lộc)

Đọc theo thứ tự: (1) câu chuyện, (2) nhân vật, (3) hành trình, (4) 5 cổng bảo vệ, (5) task L nằm ở đâu, (6) từ điển thuật ngữ. Mọi sơ đồ dùng chữ thuần nên xem được ở bất kỳ trình đọc nào.

---

## 1. Câu chuyện trong 1 phút

Bạn có một **két sắt** chứa tiền. Bạn thuê một **nhân viên giao dịch (AI agent)** đổi tiền giúp mình 24/7. Nhưng bạn không dám đưa chìa khóa két cho nhân viên, vì lỡ họ bị lừa hoặc bị hack thì mất hết.

Giải pháp của AgentShield:

- Két vẫn do **bạn** giữ chìa.
- Gắn vào két một **bảo vệ tự động** có cuốn **sổ luật** (ví dụ: mỗi lần đổi tối đa 500 USDC, một ngày tối đa 1.500 USDC, chỉ đổi giữa các loại tiền cho phép).
- Nhân viên chỉ được đưa yêu cầu cho bảo vệ. Bảo vệ kiểm luật, hợp lệ thì **tự mở két, đổi tiền, bỏ kết quả lại vào két**. Nhân viên không bao giờ chạm vào tiền.
- Trái luật thì bảo vệ từ chối, và lần từ chối đó được ghi công khai trên blockchain làm bằng chứng.
- Có nút **khẩn cấp (Kill-Switch)**: bạn bấm một cái là bảo vệ ngừng nghe nhân viên ngay.

Điều quan trọng nhất: **bảo vệ là một chương trình chạy trên blockchain**, không phải trên server của team. Nên kể cả server của team bị hack, luật vẫn đứng vững.

Phần task của bạn (L) chính là xây: **bảo vệ + sổ luật, nhà máy sinh bảo vệ, tiền test để demo, việc đưa tất cả lên mạng Fuji, và màn hình để chủ két thao tác**.

---

## 2. Các nhân vật

| Trong câu chuyện | Tên kỹ thuật | Là gì |
|---|---|---|
| Két sắt | **Safe** | Một ví đặc biệt (smart contract), giữ tiền thật. Có sẵn, không phải code mình viết |
| Bảo vệ + sổ luật | **AgentPolicyModule** | Contract mình viết (L2). Gắn vào Safe, kiểm luật, và là cái duy nhất được nhờ Safe làm việc |
| Chủ két | **Owner** | Bạn, dùng ví MetaMask/Core, ký lệnh trên trình duyệt |
| Nhân viên giao dịch | **Agent** | Backend dùng một khóa riêng (session key). Chỉ gọi được một hàm của bảo vệ |
| Nhà máy sinh bảo vệ | **AgentShieldFactory** | Contract (L3). Tạo bảo vệ cho một két, nhưng chỉ khi người yêu cầu đúng là chủ két |
| Tiền để demo | **MockUSDC, MockWAVAX** | Token giả, có nút "xin tiền" (faucet) để ai cũng tự lấy được |
| Quầy đổi tiền | **Pool + Router của Trader Joe** | Nơi đổi USDC sang WAVAX thật sự diễn ra |
| Sổ sách công khai | **Fuji + Snowtrace** | Mạng test của Avalanche, và trang web để xem mọi thứ trên đó |

---

## 3. Hành trình: 5 chương

### Chương 1: Dựng sân khấu (L3, L4). Làm một lần, bằng khóa của bạn

```
Bạn chạy script trên máy
        |
        |-- Deploy.s.sol      -> tạo MockUSDC, MockWAVAX, Factory
        |-- SetupPool.s.sol   -> tạo quầy đổi tiền USDC/WAVAX, bỏ thanh khoản vào
        |                        (giá cố định: 1 WAVAX = 25 USDC)
        |-- CreateVault.s.sol -> tạo 2 vault demo (két + bảo vệ + sổ luật)
        |-- ManualSwap.s.sol  -> thử đổi tiền 1 lần để thấy trên Snowtrace
        |
        v
Ghi địa chỉ các contract vào deployments/fuji.json
(cả team dùng chung file này để biết "bảo vệ" nằm ở đâu)
```

Vì sao dùng MockWAVAX thay token thật? Quầy đổi USDC/WAVAX thật trên Fuji gần như hết tiền, đổi vào là giá lệch nặng. Tự dựng quầy riêng thì giá ổn định, demo không thể hỏng vì người lạ.

### Chương 2: Một khách mở két (L9 wizard)

Một người dùng mới vào `/vaults/new` và đi 5 bước. Mỗi bước họ bấm ký trong ví:

```
1. Tạo Safe (két)            -> chủ két là ví của họ
2. Gọi Factory               -> Factory kiểm "người gọi có đúng là chủ két không?"
                                đúng thì tạo bảo vệ (AgentPolicyModule)
3. Bật bảo vệ cho két        -> két chính thức nghe lệnh của bảo vệ
4. Ghi sổ luật (setPolicy)   -> cap mỗi lần, cap mỗi ngày, token cho phép, hạn dùng
5. Xin tiền test + nạp vào két
```

Mục tiêu: dưới 3 phút. Đóng tab mở lại phải tiếp tục được, nên mỗi bước phải hỏi chain "bước này xong chưa?" thay vì tự nhớ.

### Chương 3: Nhân viên làm việc (không phải phần của bạn, nhưng bảo vệ của bạn phải đúng)

```
Agent: "Đổi 300 USDC sang WAVAX, tối thiểu nhận 11.5 WAVAX"
   |
   v
Bảo vệ (AgentPolicyModule) kiểm 5 cổng (xem mục 4)
   |
   |-- Hợp lệ  -> nhờ két cho phép quầy đổi tiền lấy 300 USDC,
   |              nhận WAVAX về chính két (không về địa chỉ nào khác)
   |-- Trái luật -> từ chối, giao dịch bị revert kèm lý do
```

### Chương 4: Kẻ xấu thử phá (red-team, Q8)

Team giả lập 4 đòn tấn công: đổi quá hạn mức, đổi sang token lạ, gửi tiền ra ví lạ, v.v. Mỗi đòn bị bảo vệ chặn, và có mã giao dịch (txHash) ở trạng thái reverted làm bằng chứng. Số dư két không đổi. Đây là cảnh "wow" trong demo.

### Chương 5: Nút khẩn cấp (L7)

```
Bạn giữ nút Kill trên web
   |
   v  ví của bạn ký (KHÔNG đi qua server của team)
Gọi revoke() trên bảo vệ
   |
   v
Từ giờ mọi lệnh của agent đều bị từ chối
Web hiện: "Đã khóa sau 2,4 giây"
Muốn bật lại: bạn ký setPolicy lần nữa
```

Vì sao không đi qua server? Nếu server sập hoặc bị chiếm thì bạn vẫn phải khóa được agent. Đây là nguyên tắc cốt lõi của dự án.

---

## 4. Năm cổng bảo vệ, nói bằng ví dụ

Giả sử luật: mỗi lần tối đa 500 USDC, mỗi ngày tối đa 1.500 USDC, chỉ đổi USDC và WAVAX. Agent gửi yêu cầu, bảo vệ kiểm lần lượt, cổng nào hỏng trước thì báo lỗi đó:

| Cổng | Câu hỏi | Ví dụ bị chặn | Mã lỗi |
|---|---|---|---|
| 1. Ai, khi nào | Có đúng agent không? Còn bật không? Chưa hết hạn? | Một ví lạ gọi, hoặc sau khi bấm Kill | `UnauthorizedAgent`, `PolicyInactive`, `PolicyExpired` |
| 2. Token nào | Cả hai token đều trong danh sách cho phép? | Đổi sang token lạ | `TokenNotWhitelisted`, `SameToken` |
| 3. Mỗi lần | Số tiền không vượt cap mỗi lần? | Đổi 501 USDC | `ExceedsPerTxCap` |
| 4. Mỗi ngày | Tổng hôm nay không vượt cap ngày? | Lần thứ 4 trong ngày (đã 1.500) | `ExceedsDailyCap` |
| 5. Cách thực hiện | Có mức nhận tối thiểu (`minOut`)? Hạn chót không quá xa? Sau khi đổi, số dư tăng đúng mức? | `minOut = 0` (chấp nhận mất giá tùy ý) | `ZeroMinOut`, `DeadlineTooFar`, `InsufficientOutput` |

Những chi tiết thiết kế khiến agent không thể gian lận:
- **Đường đổi tiền do contract tự dựng, và địa chỉ nhận luôn là chính két.** Agent không truyền được, nên không thể bảo "gửi tiền sang ví này".
- **Kiểm bằng số dư thực** trước và sau khi đổi, không tin lời quầy đổi tiền báo.
- **Cấp quyền (approve) đúng số tiền cần, xong là thu về 0**, không để quyền thừa.
- **Chỉ dùng kiểu gọi an toàn (`Call`)**, không bao giờ `DelegateCall`.
- **Mỗi lần ghi sổ luật mới bắt đầu một "epoch" mới**, bộ đếm chi tiêu tính lại từ 0. Qua ngày (UTC) thì bộ đếm cũng về 0.

---

## 5. Task L nằm ở đâu trong câu chuyện

| Task | Việc | Thuộc chương | Trạng thái |
|---|---|---|---|
| L1 | Dựng khung contract, xuất ABI cho cả team | nền tảng | Xong (còn tag `interfaces-v1`) |
| L2 | Bảo vệ + sổ luật (`AgentPolicyModule`) | Chương 3, 5 | Xong, 46 test |
| L3 | Factory + tiền test có faucet | Chương 1, 2 | Xong |
| L4 | Đưa lên Fuji, verify trên Snowtrace | Chương 1 | **Đang làm, chưa deploy thật. Đây là nút thắt** |
| L5 | Fuzz 10.000 lần + invariant: chứng minh toán học rằng kẻ xấu không lời | bằng chứng | **Chưa làm** |
| L6 | Biên dịch lỗi chain thành mã dễ hiểu (thêm lỗi của quầy đổi tiền) | Chương 3, 4 | Gần xong, còn lỗi router |
| L7 | Màn hình ký sổ luật + nút Kill thật | Chương 5 | Đang là mock, chưa ký thật |
| L8 | Màn hình số dư, nạp, rút | Chương 3 | Đang là mock |
| L9 | Wizard tạo vault + trang `/proof` | Chương 2 | Mới có khung, /proof dùng địa chỉ giả |
| L10 | Script kiểm tra toàn hệ thống trước giờ demo, báo cáo bảo mật | tổng kiểm | **Chưa làm** |

Thứ tự gợi ý: L4 (mở khóa mọi thứ), rồi L6 (nhỏ), rồi L5 (độc lập), rồi L7, L8, L9, cuối cùng L10.

---

## 6. Từ điển thuật ngữ blockchain

**Cơ bản**
- **Blockchain**: sổ cái công khai, ai cũng đọc được, không ai sửa được lịch sử.
- **Avalanche Fuji**: mạng thử nghiệm (testnet) của Avalanche. Tiền ở đây không có giá trị thật, nên thoải mái thử.
- **Địa chỉ (address)**: dãy `0x...` định danh một ví hoặc một contract, như số tài khoản.
- **Ví (wallet)**: ứng dụng giữ khóa bí mật của bạn (MetaMask, Core).
- **Khóa riêng (private key)**: bí mật dùng để ký. Ai có khóa là có quyền. Dự án này tuyệt đối không để khóa owner lên server.
- **Ký (sign)**: dùng khóa riêng để xác nhận "chính tôi đồng ý lệnh này".
- **Giao dịch (transaction, tx)**: một lệnh được ký và gửi lên chain. Mỗi tx có mã băm (**txHash**) để tra cứu.
- **Gas**: phí trả để chain chạy giao dịch của bạn. Trên Fuji trả bằng AVAX test (lấy miễn phí).
- **Revert**: giao dịch bị chain từ chối và mọi thay đổi bị hủy. Vẫn có txHash và có lý do lỗi. Đây là cách luật của mình "chặn" kẻ xấu.

**Contract và công cụ**
- **Smart contract**: chương trình chạy trên chain, ai cũng gọi được theo luật trong code, không ai can thiệp được sau khi đã deploy.
- **Deploy**: đưa contract lên chain, từ đó nó có một địa chỉ.
- **Verify (trên Snowtrace)**: công khai mã nguồn để ai cũng đọc và đối chiếu với contract đang chạy. Là bằng chứng "không giấu gì".
- **Snowtrace**: trang web xem mọi thứ trên Avalanche (giống google cho blockchain).
- **ABI**: bản mô tả "contract này có những hàm gì, nhận tham số gì", để web và server biết cách gọi nó.
- **Event**: dòng nhật ký mà contract phát ra (ví dụ `PolicySet`, `GuardedSwap`). Indexer đọc các event này để hiển thị.
- **RPC**: cổng để ứng dụng nói chuyện với chain.
- **Foundry / forge**: bộ công cụ viết, test, deploy contract. **Anvil** là chain giả chạy trên máy, **fork** là bản sao của Fuji để thử mà không tốn gì.
- **Fuzz test**: test ném hàng nghìn đầu vào ngẫu nhiên để tìm lỗi. **Invariant test**: kiểm một điều "luôn luôn đúng" (ví dụ tổng chi không vượt cap) dù chuyện gì xảy ra.

**Tiền và đổi tiền**
- **Token (ERC-20)**: loại tiền chạy trên chain (USDC, WAVAX).
- **Base units / decimals**: chain không có số thập phân. 1 USDC được lưu thành `1000000` (6 chữ số 0). Vì vậy dự án cấm dùng số thực, chỉ dùng `bigint`.
- **Faucet**: vòi phát tiền test miễn phí, có thời gian chờ giữa hai lần.
- **Approve / allowance**: cấp phép cho một bên được lấy tối đa X token của bạn. Cấp thừa là rủi ro, nên mình cấp đúng số cần rồi thu về 0.
- **Pool (thanh khoản) / swap / router**: pool là kho chứa hai loại token. Swap là đổi từ loại này sang loại kia dựa vào tỉ lệ trong kho. Router là cửa giao dịch dẫn đường tới pool.
- **Slippage / `minOut`**: giá có thể lệch giữa lúc gửi lệnh và lúc khớp. `minOut` là mức nhận tối thiểu chấp nhận được, không đạt thì hủy.
- **Deadline**: lệnh quá hạn thì bị hủy.

**Của Safe**
- **Safe**: ví thông minh phổ biến, nhiều người dùng để giữ tiền an toàn.
- **Module (của Safe)**: phần mở rộng cho phép một contract được nhờ Safe thực thi giao dịch theo luật riêng của nó. AgentPolicyModule chính là một module.
- **Session key**: khóa riêng quyền hạn thấp dành cho agent. Mất cũng không sao vì chỉ gọi được hàm bị bao bọc bởi luật.
- **Epoch**: số thứ tự "phiên bản luật". Mỗi lần ghi luật mới, epoch tăng và bộ đếm chi tiêu làm lại.

---

## 7. Nếu chỉ nhớ ba điều

1. **Luật nằm trên chain, không nằm trên server.** Nên kể cả team bị hack, tiền vẫn an toàn.
2. **Agent không chạm tiền, chỉ gửi yêu cầu.** Bảo vệ kiểm luật rồi mới nhờ két làm.
3. **Chủ két luôn ký bằng ví của mình trên trình duyệt**, kể cả khi đặt luật hay bấm Kill. Không đi qua server.
