> **Tài liệu pitch & giải thích cho giám khảo/newbie** — không phải spec kỹ thuật. Khi lệch với [`../architecture/`](../architecture/), bản trong `architecture/` thắng. Mô tả "5 chốt" và cap ở đây là bản đơn giản hóa; bản đầy đủ (cap theo token, precheck, invariant) xem [`contracts.md`](../architecture/contracts.md).

# AGENTSHIELD: KÉT SẮT THÔNG MINH & KHIÊN BẢO VỆ CHO AI AGENT

*TÀI LIỆU ĐẶC TẢ NHANH PROTOTYPE (BẢN TINH GỌN CHO ĐỘI NGŨ NEWBIE BLOCKCHAIN)*

Avalanche UniHack 2026 | Kết hợp Đề #12 + Lõi #14 | Đội hình: 2 Fullstack (FS1, FS2) + 1 AI Engineer (AIE)

## 1. HIỂU NHANH TRONG 2 PHÚT: AGENTSHIELD LÀ GÌ & TỪ ĐIỂN CHO NEWBIE

> **💡 VÍ DỤ ĐỜI THỰC: TẠI SAO CẦN AGENTSHIELD?**
>
> • Bài toán: Bạn có Két sắt chứa 10,000 USD. Bạn thuê một con Robot AI đi chợ đổi tiền kiếm lời lúc bạn đang ngủ (khi giá AVAX rẻ thì lấy USDC mua vào).
>
> • Rủi ro chết người: Nếu bạn đưa Chìa khóa gốc két sắt (Private Key) cho Robot, lỡ Robot bị chập mạch (AI ảo giác) hoặc bị kẻ xấu lừa (Hack), nó sẽ mở két lấy sạch 10,000 USD đưa cho kẻ xấu. Trên Blockchain, tiền chuyển đi rồi là MẤT VĨNH VIỄN, không có tổng đài ngân hàng nào hoàn lại được!
>
> • Giải pháp AgentShield: Bạn giữ Chìa khóa gốc. Bạn chỉ đưa cho Robot một 'Thẻ phụ ngân hàng' gắn kèm Ổ khóa tự động trên két sắt: (1) Mỗi lần chỉ được tiêu tối đa 500 USD, cả ngày tối đa 1,500 USD; (2) Chỉ được mua bán ở đúng 1 siêu thị quen (Sàn Trader Joe); và (3) Mua xong, hàng hóa BẮT BUỘC chảy thẳng về lại két sắt của bạn, Robot không có túi riêng để giấu tiền!

**Bảng quy đổi 6 thuật ngữ Blockchain sang ngôn ngữ đời thường (Đọc 30 giây là hiểu hết)**

| Thuật ngữ trong bài | Ví dụ đời thường tương đương | Vai trò trong Prototype AgentShield của nhóm |
|---|---|---|
| Két sắt Safe <br>  (Gnosis Safe Wallet) | Két sắt ngân hàng giữ toàn bộ tiền của công ty. | Nơi giữ 10,000 USD tiền gốc (USDC và WAVAX). Không một con AI nào được cầm chìa khóa gốc của két này. |
| Thẻ phụ của AI <br>  (Agent Session Key) | Thẻ tín dụng phụ bố mẹ cấp cho con cái đi siêu thị. | Chìa khóa phụ cấp riêng cho Bot. Bị giới hạn số tiền tiêu trong ngày và Chủ ví có thể bấm nút khóa thẻ bất cứ lúc nào. |
| Ổ khóa tự động <br>  (Smart Contract Module) | Cửa từ tự động lập trình sẵn quy tắc ở cửa két sắt. | File code AgentPolicyModule.sol (~180 dòng) chạy trên mạng Avalanche. Tự động chặn đứng nếu AI đòi tiêu quá hạn mức. |
| Sàn đổi tiền DEX <br>  (Trader Joe Router) | Quầy thu đổi ngoại tệ tự động (Đổi USD sang Vàng). | Nơi Bot mang đồng USDC đến đổi sang đồng WAVAX và ngược lại. |
| Phòng chạy thử Anvil <br>  (Anvil Fork Simulator) | Bản photocopy của thế giới thật để tập dượt trước. | Chạy thử giao dịch trên máy chủ để xem 'nếu ký thật thì mất bao nhiêu, nhận bao nhiêu' mà không tốn 1 xu tiền thật. |
| Cấp tiền lẻ vừa đủ <br>  (Exact Approval) | Mua món hàng 200$ thì chỉ đưa đúng 200$ cho thu ngân. | Thay vì cho phép sàn DEX rút 'vô hạn' tiền trong ví, Ổ khóa chỉ cho phép rút đúng số tiền của lệnh đó (VD: đúng 200 USDC). |

## 2. TIÊU CHÍ CHẤM ĐIỂM CỦA GIÁM KHẢO & LÝ DO ĐỀ TÀI NÀY ĐẠT GIẢI NHẤT

| Tiêu chí chấm điểm | Điểm | Cách Prototype AgentShield ăn điểm tuyệt đối trước Ban Giám Khảo |
|---|---|---|
| 1. Kỹ thuật (Technical) | 25% | Có đầy đủ Frontend, Backend, Hàng đợi Redis, Phòng chạy thử Anvil và Ổ khóa Smart Contract (kèm 10,000 bài test tự động chứng minh Hacker không thể rút được 1 xu). |
| 2. Tích hợp Avalanche | 25% | Ổ khóa và Két sắt chạy thật trên mạng thử nghiệm Avalanche Fuji. Tận dụng tốc độ 1.5 giây của Avalanche để nút 'Khóa khẩn cấp (Kill-Switch)' cắt quyền AI ngay lập tức. |
| 3. Sáng tạo (Innovation) | 15% | Khác biệt hoàn toàn với các nhóm chỉ làm chat AI: Kết hợp 2 lớp khiên (Chạy thử bằng AI ở ngoài + Khóa cứng đường đi của tiền ở trong két sắt) và có sẵn 4 nút bấm giả lập Hacker. |
| 4. Ứng dụng thực tế | 15% | Giải quyết nỗi sợ lớn nhất năm 2026: Giúp các quỹ đầu tư và cá nhân dám giao việc cho AI tự giao dịch 24/7 mà không sợ mất trộm vốn. |
| 5. Thuyết trình (Pitch) | 10% | Màn demo 3 phút cực kỳ kịch tính: Chạy 1 lệnh tự động thành công -> Bấm 4 nút cho Hacker tấn công -> Hệ thống hú còi đỏ và chặn sạch cả 4 đòn! |
| 6. Giao diện (UI/UX) | 10% | Màn hình 3 cột rõ ràng: Nhìn thấy ngay thanh hạn mức ngày (200 / 1,500 USDC), bảng số dư Trước/Sau và lời giải thích bằng tiếng Việt dễ hiểu. |

## 3. INPUT – PROCESS – OUTPUT: HỆ THỐNG CHẠY NHƯ THẾ NÀO QUA VÍ DỤ CỤ THỂ?

| Tình huống thực tế | 1. INPUT (Đầu vào) | 2. PROCESS (Hệ thống xử lý gì bên trong?) | 3. OUTPUT (Kết quả hiện ra) |
|---|---|---|---|
| Tình huống A: <br>  Chủ ví cài đặt luật ban đầu | Chủ ví nhập trên Web: <br>  • Hạn mức: 500/ngày. <br>  • Chỉ đổi USDC <-> WAVAX tại sàn Trader Joe. | Chủ ví bấm lưu và ký xác nhận trên ví -> Quy tắc được khắc cứng vào Ổ khóa AgentPolicyModule.sol trên mạng Avalanche. | • Giao diện báo 'Đang Bảo Vệ'. <br>  • Thanh chi tiêu ngày hiện: 0 / 1,500 USDC. |
| Tình huống B: <br>  Bot tự động đổi tiền hợp lệ <br>  (Happy Path) | Giá AVAX giảm rẻ. Bot tính toán cần lấy 200 USDC đổi sang WAVAX để cân bằng quỹ. | 1. Lệnh 'Đổi 200 USDC' xếp hàng vào Redis Queue. <br>  2. Khiên 1 (Phòng chạy thử Anvil): Chạy nháp thấy mất 200 USDC, thu về +8 WAVAX (Hợp lệ). <br>  3. AI Gemini: Đọc kết quả nháp, viết báo cáo tiếng Việt. <br>  4. Khiên 2 (Ổ khóa trên chuỗi): Kiểm tra 200 <= 500 -> Mở két lấy đúng 200 USDC đổi lấy 8 WAVAX bỏ thẳng vào lại Két sắt. | • Két sắt có thêm +8 WAVAX. <br>  • Thanh hạn mức ngày tăng lên: 200 / 1,500 USDC. <br>  • AI hiện chữ Xanh: 'Giao dịch an toàn, tiêu 13.3% hạn mức ngày'. |
| Tình huống C: <br>  AI bị Hack đòi rút lố tiền <br>  (Attack Blocked) | Bấm nút Test Hack trên Web: Hacker xúi AI rút 2,000 USDC hoặc sửa địa chỉ nhận tiền thành ví Hacker. | • Cách 1 (Qua Web): Phòng chạy thử Anvil phát hiện 2,000 > 1,500 -> Báo lỗi ngay, không gửi lên chuỗi. <br>  • Cách 2 (Hacker đi cửa sau bắn thẳng lên mạng Avalanche): Ổ khóa Smart Contract kiểm tra thấy vượt trần 1,500$ -> Tự động HỦY LỆNH (Revert)! | • Két sắt giữ nguyên 100% tiền, không mất 1 xu. <br>  • Giao diện bật cảnh báo Đỏ giải thích rõ lý do chặn bằng tiếng Việt. |

## 4. SƠ ĐỒ KIẾN TRÚC HỆ THỐNG (FRONTEND, BACKEND, QUEUE & BLOCKCHAIN)

- **Tầng 1 – Giao diện Web (Vite + React SPA - Port 3000):** Chia làm 3 cột trên 1 màn hình duy nhất: Cột trái để Chủ ví cài đặt hạn mức & bấm nút Khóa khẩn cấp (Kill-Switch); Cột giữa hiện bảng so sánh số dư Trước/Sau và lời giải thích tiếng Việt của AI; Cột phải có 4 nút bấm giả lập Hacker tấn công.
- **Tầng 2 – Backend, Hàng đợi Redis & Phòng chạy thử (NestJS + BullMQ + Anvil):** Khi có lệnh mua bán hoặc lệnh test hack, API đẩy vào Hàng đợi Redis để xử lý lần lượt, không bao giờ bị đơ mạng. Phòng chạy thử Anvil (chạy trong Docker) sao chép mạng Avalanche thật để test giao dịch miễn phí trong 0.2 giây.
- **Tầng 3 – Blockchain Avalanche Fuji (Két sắt Safe + Ổ khóa AgentPolicyModule.sol):** Chốt chặn cuối cùng giữ tiền. Dù Server Backend của nhóm có bị sập hay bị Hacker bỏ qua, Ổ khóa trên Blockchain vẫn tự bảo vệ tiền 24/7.

## 5. TRIỂN KHAI LOGIC CỤ THỂ: CODE SMART CONTRACT & 3 CON AGENT LÀM GÌ?

### 5.1. Logic Ổ khóa Blockchain (AgentPolicyModule.sol) – Chỉ 5 bước kiểm tra siêu gọn
Bạn Fullstack 1 (FS1) chỉ cần viết 1 file Smart Contract khoảng 180 dòng. Điểm ăn tiền nhất nằm ở hàm executeGuardedSwap() với 5 chốt chặn nối tiếp nhau (nếu sai bất kỳ chốt nào, giao dịch tự động hủy ngay):

**💻 Logic cốt lõi trong AgentPolicyModule.sol (Viết dễ đọc như tiếng Anh thông thường)**

```solidity
function executeGuardedSwap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline) external {
   // CHỐT 1: Kiểm tra đúng Thẻ phụ của AI không? Đã hết hạn hay bị Chủ ví bấm nút Kill-Switch chưa?
   if (msg.sender != policy.agentSigner) revert UnauthorizedAgent();
   if (!policy.isActive || block.timestamp > policy.expiry) revert PolicyInactive();

   // CHỐT 2: Đồng tiền đem đổi có nằm trong danh sách cho phép (chỉ USDC và WAVAX) không?
   if (!allowedTokens[tokenIn] || !allowedTokens[tokenOut]) revert TokenNotWhitelisted();

   // CHỐT 3 & 4: Số tiền có vượt trần 1 lần (500) không?
   if (amountIn > policy.maxPerTx) revert ExceedsPerTxCap();
   uint256 today = block.timestamp / 1 days; // Tự động tính mã ngày hiện tại, qua ngày mới tự về 0!
   if (spentInDay[today] + amountIn > policy.dailyCap) revert ExceedsDailyCap();
   spentInDay[today] += amountIn;

   // CHỐT 5 (QUAN TRỌNG NHẤT): Chỉ cấp đúng số tiền lẻ (amountIn) và ÉP CỨNG người nhận là Két sắt Safe!
   safe.execApprove(tokenIn, policy.allowedRouter, amountIn);
   safe.execSwapOnDEX(amountIn, minOut, path, address(safe), deadline); // <-- address(safe): Tiền luôn quay về Két!
 }
```

### 5.2. Bản chất 3 con Agent ở Backend: Con nào là Toán học, con nào là AI thật?

| Tên Worker / Agent | Bản chất thực sự (Không màu mè) | Cách code cụ thể (Dành cho FS2 và AIE) |
|---|---|---|
| Worker 1: <br>  Bot Cân Bằng Quỹ <br>  (Quant Rebalancer) | KHÔNG DÙNG LLM/CHATGPT. <br>  Là 1 hàm tính toán tỷ lệ phần trăm chạy định kỳ 15 giây/lần. | • Ví dụ: Két sắt có 500$ USDC và 400$ WAVAX (Tổng 900). <br>  • Bot thấy WAVAX thiếu 50$ -> Tự tạo lệnh: 'Đổi 50 USDC sang WAVAX' đẩy vào hàng đợi Redis. <br>  • Tại sao không dùng AI ở đây? Vì quy tắc cuộc thi cấm để LLM tự quyết định số tiền giao dịch! |
| Worker 2: <br>  Kiểm Toán Viên AI <br>  (Sim & AI Explainer) | DÙNG AI THẬT (Google Gemini 2.5 Flash API miễn phí) + Thư viện ép khuôn JSON (Zod). | • Bước 1: Đưa lệnh vào Phòng chạy thử Anvil, lấy ra kết quả: { truUSDC: 200, congWAVAX: 8, loi: null }. <br>  • Bước 2: Gửi cục JSON này cho Gemini AI kèm yêu cầu: 'Hãy dịch sang tiếng Việt dễ hiểu cho chủ ví'. <br>  • Bước 3: Nếu kết quả chạy thử thành công -> Dùng Thẻ phụ ký lệnh gửi lên mạng Avalanche Fuji. |
| Worker 3: <br>  Bot Giả Lập Hacker <br>  (Red-Team Chaos) | Bộ 4 kịch bản tấn công cài sẵn + Ô nhập câu lệnh lừa AI (Prompt Injection) trên Web. | • Gắn với 4 nút Đỏ trên giao diện Web để bấm khi thuyết trình: <br>    1. Đòi rút 2,000 USDC (Vượt trần ngày 1,500 USDC). <br>    2. Đòi đổi tiền nhưng điền ví nhận là ví Hacker (0x999...). <br>    3. Đòi xin quyền rút vô hạn toàn bộ két sắt. <br>    4. Bỏ qua trang Web, bắn thẳng lệnh rút 2,000 USDC lên mạng Avalanche để chứng minh Ổ khóa chặn được! |

## 6. 12 CÂU HỎI 'GIẢI NGỐ' NHANH (ĐỌC ĐỂ HIỂU SÂU & TRẢ LỜI GIÁM KHẢO)

| Câu hỏi thắc mắc của thành viên / Giám khảo | Câu trả lời ngắn gọn, dễ hiểu kèm ví dụ |
|---|---|
| 1. Sao không lập 1 ví phụ bỏ vào 500$ đưa cho AI xài, mất thì thôi, cần gì làm Két sắt phức tạp? | Nếu đưa ví 500$ có chìa khóa gốc cho AI, khi bị Hack bạn mất đứt 500$ đó vào túi Hacker. Còn với AgentShield, AI được tiêu hạn mức 500$ nhưng là đổi từ USDC sang AVAX rồi tiền AVAX chảy ngược về lại Két sắt của bạn -> Dù AI bị Hack bạn cũng không mất đồng nào! |
| 2. Tại sao không cho con AI (Gemini/GPT) tự suy nghĩ giá lên xuống rồi tự ký chuyển tiền luôn? | Vì AI ngôn ngữ hay bị 'ảo giác' (bịa số liệu) hoặc dễ bị Hacker gài câu chữ lừa chuyển tiền. Dùng công thức toán học để tính số tiền và dùng AI để kiểm tra/giải thích tiếng Việt là cách làm an toàn chuẩn quốc tế mà Giám khảo đánh giá cao nhất. |
| 3. Nhỡ Hacker lấy trộm được 'Thẻ phụ' của AI rồi tự viết code bắn thẳng lên Blockchain, không đi qua Web của nhóm thì sao? | Vẫn an toàn 100%! Vì Khiên bảo vệ số 2 (AgentPolicyModule.sol) nằm ngay trên mạng Blockchain Avalanche. Dù Hacker đi cửa sau gọi thẳng lên mạng, Ổ khóa trên chuỗi vẫn kiểm tra 5 chốt và tự động HỦY LỆNH nếu vượt hạn mức hoặc sai ví nhận. |
| 4. Làm sao cấm được việc Hacker đổi tiền trên sàn xong bảo sàn chuyển tiền đó về ví Hacker? | Khi gọi hàm đổi tiền trên sàn DEX, phải điền ô 'Địa chỉ người nhận'. Trong code Ổ khóa của nhóm, nhóm khóa cứng ô đó là địa chỉ Két sắt (address(safe)), không cho AI điền số khác vào. Tiền đổi ra bắt buộc rơi về két! |
| 5. Hạn mức 1,500$/ngày làm sao tự động reset về 0 khi sang ngày mới? | Dùng phép chia thời gian cho 1 ngày (block.timestamp / 86400 giây). Hôm nay có mã ngày là 20760, ngày mai tự nhảy sang mã 20761. Do đó sang ngày mới, ô nhớ tiền tiêu của ngày mới tự động bằng 0 mà không cần ai bấm nút reset! |
| 6. 'Phòng chạy thử Anvil Fork' nghe lạ quá, cài đặt có khó không? | Rất dễ! Nó chỉ là 1 dòng lệnh có sẵn trong bộ công cụ Foundry chạy trong Docker: 'anvil --fork-url <link_mang_avalanche>'. Nó tự tạo 1 mạng ảo giống hệt mạng thật trên máy mình trong 3 giây. |
| 7. Tại sao phải dùng Hàng đợi Redis (BullMQ) ở Backend? | Vì mỗi lệnh cần ~2 giây (chạy thử Anvil + hỏi Gemini + gửi lên chuỗi). Có Redis xếp hàng từng lệnh sẽ giúp lúc thuyết trình bấm liên tục 4 nút Hack hệ thống chạy mượt mà, không bị xung đột hay treo web. |
| 8. Lúc đang đứng trên sân khấu thuyết trình mà mạng Wifi yếu làm Gemini AI trả lời chậm thì sao? | Nhóm cài sẵn chế độ Dự phòng (Fallback): Quá 2 giây mà Gemini chưa trả lời, code tự động lấy mẫu câu tiếng Việt có sẵn điền số liệu vào hiện lên màn hình ngay. Không bao giờ sợ lỗi lúc chấm thi! |
| 9. Trong báo cáo có nhắc 'Kiểm thử 10,000 kịch bản (Fuzz Test)', làm cái đó mất bao lâu? | Chỉ mất khoảng 30 dòng code test trong Foundry! Máy tính sẽ tự động thay 10,000 con số ngẫu nhiên vào để thử phá Ổ khóa và chứng minh 'Số dư ví Hacker luôn bằng 0'. Chạy mất 5 giây nhưng ăn trọn 25% điểm Kỹ thuật. |
| 10. Tại sao phải làm trên mạng Avalanche mà không phải mạng khác? | Vì khi phát hiện AI bị bất thường, Chủ ví cần bấm nút 'Khóa khẩn cấp (Kill-Switch)'. Trên mạng chậm mất 15-30 giây Hacker đã kịp rút tiền; còn trên Avalanche chỉ mất ~1.5 giây là khóa xong thẻ phụ! |
| 11. Nhóm dùng tiền thật hay tiền ảo để làm và chạy thử? | Dùng 100% tiền thử nghiệm miễn phí trên mạng Avalanche Fuji Testnet (nhận miễn phí từ trang Faucet chính thức của Avalanche). Không tốn bất kỳ đồng tiền thật nào. |
| 12. Điểm yếu trung thực của Prototype này là gì nếu Giám khảo hỏi xoáy? | Hiện tại Ổ khóa kiểm tra số tiền đầu vào (USDC), nhưng nếu sàn giao dịch bị làm giá ảo (trượt giá mạnh) thì số AVAX nhận về có thể bị ít đi. Hướng nâng cấp tiếp theo là gắn thêm bộ đo giá chuẩn (Chainlink Oracle) vào Ổ khóa. |

## 7. PHÂN CÔNG NHIỆM VỤ 3 THÀNH VIÊN & KỊCH BẢN DEMO 3 PHÚT GIÀNH GIẢI NHẤT

| Thành viên | Việc cần làm trong 3 tuần (Độc lập, không chờ nhau) | Kết quả bàn giao |
|---|---|---|
| Fullstack 1 (FS1) <br>  (Phụ trách Két sắt & Ổ khóa) | • Học cú pháp Solidity cơ bản trong 2 ngày đầu. <br>  • Viết file AgentPolicyModule.sol (~180 dòng) có 5 chốt chặn. <br>  • Viết file test tự động và đưa lên mạng thử nghiệm Avalanche Fuji. | 1 Địa chỉ hợp đồng trên mạng Fuji + Ảnh chụp màn hình vượt qua 10,000 bài test xanh mượt. |
| Fullstack 2 (FS2) <br>  (Phụ trách Web, Queue & Anvil) | • Dựng Docker Compose (chạy sẵn Redis, Postgres, Anvil). <br>  • Viết Worker 1 (công thức cân bằng quỹ) và luồng gọi Anvil chạy thử. <br>  • Làm giao diện Web 3 cột (Cài luật - Xem AI giải thích - 4 nút bấm Hack). | Trang Web Dashboard chạy mượt, bấm nút thấy thanh ngân sách và thông báo nhảy trực tiếp. |
| AI Engineer (AIE) <br>  (Phụ trách AI & Kịch bản Hack) | • Viết hàm gọi Gemini 2.5 Flash API ép khuôn đầu ra JSON tiếng Việt (kèm mẫu câu dự phòng khi mất mạng). <br>  • Thiết kế 4 kịch bản tấn công cho Worker 3 gắn vào 4 nút Đỏ trên Web. | Module AI dịch lỗi chuẩn xác sang tiếng Việt + 4 đòn tấn công chạy phát ăn ngay trên sân khấu. |

> **🏆 KỊCH BẢN LIVE DEMO 3 PHÚT TRÊN SÂN KHẤU (ĐẢM BẢO GÂY ẤN TƯỢNG MẠNH VỚI GIÁM KHẢO)**
>
> - Phút 1 (Đặt vấn đề & Chạy lệnh chuẩn): Mở màn hình 3 cột. Bấm nút 'Chạy Cân Bằng Quỹ (200 USDC)'. Cột giữa hiện ngay kết quả chạy thử sau 0.3 giây, AI báo tiếng Việt màu xanh: 'An toàn, tiêu 13.3% hạn mức ngày'. Tiền đổi thành công, thanh ngân sách nhảy lên 200 / 1,500 USDC.
>
> - Phút 2 (Màn cao trào – Bấm nút cho Hacker tấn công): Bấm nút Đỏ số 1 ('Rút lố 2,000 USDC') -> Khiên 1 (Phòng chạy thử + AI) hú còi đỏ chặn ngay ngoài cửa. Bấm tiếp nút Đỏ số 4 ('Hacker bỏ qua Web bắn thẳng lên Blockchain') -> Màn hình hiện bằng chứng Khiên 2 (Ổ khóa trên Avalanche) đã tự động HỦY LỆNH! Tiền trong két sắt còn nguyên 100%.
>
> - Phút 3 (Chốt hạ): Bấm nút 'KHÓA KHẨN CẤP (KILL-SWITCH)', sau 1.5 giây thẻ phụ của AI bị vô hiệu hóa hoàn toàn. Chiếu kết quả 10,000 bài test bảo mật thành công và kết thúc thuyết trình!
