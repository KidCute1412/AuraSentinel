# Contributing

## Tên branch

`type/scope-mô-tả-ngắn`: chữ thường, nối bằng dấu gạch ngang, tối đa khoảng 40 ký tự.

- `type`: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `poc`
- `scope` (tuỳ chọn): `web`, `server`, `contracts`, `shared`, `infra`
- Có thể thêm số issue: `feat/web-123-access-gate`

Ví dụ: `feat/web-access-gate`, `poc/safe-module-fuji`, `fix/contracts-spend-limit`, `ci/cd-workflow`.

## Commit

Conventional Commits: `type(scope): mô tả`, ví dụ `feat(web): add access gate`.

## Pull request

Một PR một mục đích. CI (`ci-pass`) phải xanh trước khi merge. Với UI, đọc `docs/product/design-system.md` trước.

## POC

Thử nghiệm rủi ro kỹ thuật nằm trong [`poc/`](./poc/README.md), kết quả ghi ở `docs/research/poc-results.md`.
