# 📚 AgentShield — Docs

Vault Safe + module policy on-chain cho phép AI agent giao dịch 24/7 mà không thể lấy tiền. Avalanche Fuji · hackathon 3 tuần · demo không được fail.

Docs viết bằng tiếng Việt; định danh kỹ thuật giữ tiếng Anh.

## Đọc theo thứ tự

| # | File | Nội dung | Khi nào đọc |
|---|---|---|---|
| 1 | [`product/pitch.md`](./product/pitch.md) | AgentShield là gì (ví dụ đời thường), tiêu chí chấm, 12 câu FAQ giám khảo | Mới vào dự án, chuẩn bị pitch |
| 2 | [`architecture/system-design.md`](./architecture/system-design.md) | **Source of truth.** 5 nguyên tắc, kiến trúc, tradeoff công nghệ, pipeline Auditor, red-team, data model, API, threat checklist | Trước khi viết bất kỳ code nào |
| 3 | [`architecture/codebase.md`](./architecture/codebase.md) | Folder, module NestJS, ranh giới, frontend, test, phân công | Khi tạo file/module mới |
| 4 | [`architecture/contracts.md`](./architecture/contracts.md) | Spec Solidity: storage, hàm, gate, error, event, test | FS1 viết contract; FS2/AIE khi dùng ABI |
| 3a | [`architecture/api.md`](./architecture/api.md) | API reference multi-vault: 21 endpoint, auth SIWE, SSE, lỗi, migration | Viết controller hoặc gọi API từ web |
| 3b | [`product/ui-pages.md`](./product/ui-pages.md) | Các trang UI (`/`, `/demo`, `/vaults/new`, `/vaults/:safe`, `/proof`), component, trạng thái, ma trận trang↔API | Viết `apps/web` |
| 3c | [`product/design-system.md`](./product/design-system.md) | **Bắt buộc cho mọi UI.** Phong cách "Sentinel Terminal": token màu/chữ/bóng, component, pattern AgentShield, cấm | Mọi thay đổi trong `apps/web` |
| 5 | [`runbook/setup-and-bringup.md`](./runbook/setup-and-bringup.md) | Env, thứ tự deploy, lệnh chạy, lỗi thường gặp | Dựng môi trường |
| 7 | [`research/poc-results.md`](./research/poc-results.md) | Kết quả các POC (danh sách ở [`../poc/`](../poc/README.md)) | Trước khi chốt thiết kế một phần rủi ro |
| 6 | [`runbook/demo.md`](./runbook/demo.md) | Checklist trước giờ thi, kịch bản 3 phút, xử lý sự cố | Tuần 3, rehearsal |

## Khi các file lệch nhau

`system-design.md` > `codebase.md` > `contracts.md` (cho chữ ký hàm thì `contracts.md` thắng) > `product/pitch.md`. `pitch.md` là bản đơn giản hóa để thuyết trình, không dùng làm spec.

Quy tắc bất biến (P1–P5, Shield 1/2) nằm ở `system-design.md` §1 và skill `agentshield-invariants`; mọi thay đổi vi phạm phải sửa docs trước.

## Trạng thái

Giai đoạn **thiết kế**: chưa scaffold code. Khi code xong một phần, cập nhật các lệnh trong `runbook/` cho khớp thực tế.
