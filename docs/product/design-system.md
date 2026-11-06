# Design system: "Sentinel Terminal"

Nền tảng neo-brutalist mượn từ https://team1vn.xyz/ (Team1 Vietnam UniHack): nền tối, góc vuông, viền 1px, bóng cứng, Hanken Grotesk + Geist Mono. **Nhận diện riêng của AgentShield** (để không bị nhầm với web cuộc thi): màu nhấn **xanh lục "shield"** thay cho đỏ, đỏ chỉ dành cho nguy hiểm, hero có luồng giao dịch chạy trực tiếp, giọng văn kiểu báo cáo an ninh. Không dùng logo/ảnh/thương hiệu Team1 hay Avalanche.
Áp dụng cho mọi thứ trong `apps/web`. Agent bắt buộc đọc skill `ui-design-system` trước khi tạo hoặc sửa UI. Khi xung đột: `agentshield-invariants` > tài liệu này > `frontend-design` / `web-design-guidelines` / `shadcn-ui`.

## 1. Triết lý
Neo-brutalist tối, kiểu "terminal + poster": nền gần đen, viền 1px cứng, **góc vuông tuyệt đối**, đổ bóng offset cứng (không blur), một màu nhấn xanh lục (đỏ chỉ cho BLOCK/Kill), chữ mono viết hoa cho nhãn và số liệu. Tiêu đề rất đậm, tracking âm. Ưu tiên đọc được trên máy chiếu (demo): tương phản cao, chữ lớn.

## 2. Token

### 2.1 Màu (hai chất liệu: Night Radar = dark, Day Blueprint = light; cả hai đều bắt buộc hỗ trợ)
| Token | Giá trị | Dùng cho |
|---|---|---|
| `bg` | `#0a0a0b` | nền trang |
| `surface` | `#141416` | card, panel, input |
| `hover` | `#1d1d21` | hover hàng/nút phụ |
| `fg` | `#f4f2ec` | chữ chính (ấm, không dùng `#fff` thuần cho body) |
| `ink` | `#e9e6df` | chữ trong khối kem |
| `soft` | `#c9c6be` | chữ phụ mức 1 |
| `muted` | `#a5a39c` | chữ phụ mức 2, nhãn |
| `line` | `#2a2a2e` | đường kẻ, viền mặc định |
| `line-strong` | `#3d3d43` | viền nhấn, tab, input |
| `accent` | `#2ee59d` | màu thương hiệu: nút chính (chữ `#0a0a0b`), link, tab gạch chân, glow hero |
| `ok` | `#2ee59d` | trạng thái an toàn / APPROVE (cùng giá trị với `accent`: xanh = an toàn) |
| `danger` | `#e6212f` | **chỉ** BLOCK, revert, Kill-Switch, lỗi |
| `warn` | `#ffb020` | cảnh báo |
| `highlight` | `#ffd23f` | badge đếm, ô chú ý (chữ trên nó `#141414`) |
| `shadow` | `#000` | màu bóng cứng |
| `tint-mint` `#123d2e` · `tint-sky` `#12304f` · `tint-pink` `#4a1a29` · `tint-amber` `#3b3010` | | khối nền nhóm/section, một màu mỗi nhóm |

**Hai theme** qua `html[data-theme=dark|light]`; mặc định theo `prefers-color-scheme`, nút `ThemeToggle` xoay AUTO → LIGHT → DARK, lưu `localStorage` (try/catch), script inline trong `index.html` đặt theme trước first paint. Bảng trên là dark. Light "Day Blueprint": `bg #fbf7ef`, `surface #fffdf8`, `fg #141414`, `line #d9d0bd`, `line-strong #8f8670`, `accent #14b57c` (nền nút), `danger #d4202c`, tint nhạt (`mint #d3efe1`, `sky #d6e5f6`, `pink #f8d9de`, `amber #f5e6b8`).
Token riêng cho chữ để đạt ≥ 4.5:1 ở cả hai theme: `accent-text` (dark `#2ee59d`, light `#0a7a52`), `danger-text` (dark `#ff5a66`, light `#b3121d`), `warn` (light `#8a5a00`). Chữ trên nền `accent` luôn là `on-accent #0a0a0b` (không dùng `text-bg`). Link và icon xanh dùng `text-accent-text`.
**Bóng cứng theo theme:** `--shadow-color` dark = `#15694b` (xanh đậm, vì `#000` biến mất trên nền gần đen), light = `#141414` (mực).
Không dùng màu ngoài bảng này. Không gradient pastel; gradient duy nhất cho phép là glow xanh lục, lưới blueprint 32px và radar sweep (chỉ dark, 18s, tắt khi reduced-motion) ở hero, cùng sọc hazard đỏ quanh khối Kill-Switch.

### 2.2 Chữ
- Sans: `Hanken Grotesk` (500–900). Mono: `Geist Mono`. Không dùng font khác. Self-host qua `@fontsource` (demo offline không được fail).
- Body 15px (demo/projector ≥ 16px). Số tiền, địa chỉ, hash, nhãn, badge, trạng thái: **mono**.

| Vai trò | Font | Size | Weight | Tracking | Ghi chú |
|---|---|---|---|---|---|
| Hero | sans | clamp(64px, 12vw, 179px) | 900 | -5% | italic, uppercase |
| h2 | sans | 48px | 900 | -2% | |
| h3 / tiêu đề card | sans | 17–20px | 800 | -2% | |
| body | sans | 15–16px | 500 | 0 | |
| label/badge/tag | mono | 11–12px | 500–700 | +4–8% | uppercase |
| số liệu lớn | mono | 24–48px | 700 | 0 | tabular-nums |

### 2.3 Khác
- Spacing: lưới 4px; container tối đa 1240px, padding ngang 32px (16px mobile); header 56px sticky, sub-nav sticky dưới header.
- Viền: 1px `line` (mặc định) hoặc `line-strong`. **Radius 0** ở mọi nơi.
- Bóng: `--shadow-hard: 5px 5px 0 #000` (card nổi bật/nút chính), `3px 3px 0 #000` (nhỏ). Không blur, không bóng mềm.
- Z-index: header 40, sub-nav 30, dialog 50, toast 60.
- Motion: ≤ 200ms, `ease-out`; chỉ flash viền/nền, slide ngắn, dịch bóng. Phải tôn trọng `prefers-reduced-motion`.
- Icon: `lucide`, stroke 2, vuông góc; không emoji làm icon.

## 3. Component

**Họa tiết riêng "shield cut" (chamfer):** card nổi bật, nút chính/phụ trên landing và khối Kill-Switch cắt chéo 2 góc (trên-phải, dưới-trái) 14px bằng `clip-path` (class `.chamfer`). `clip-path` cắt mất `box-shadow` và `border`, nên dùng component `shared/ui/Chamfer` (viền = lớp ngoài 1px, bóng = `drop-hard` trên wrapper). Vẫn là "góc vuông": chỉ cắt chéo, không bo tròn. Bố cục landing: tiêu đề section nằm cột trái (4/12), nội dung cột phải (8/12), thẻ so le theo `translate-y`, đánh số section `01 · …`.

| Component | Quy tắc |
|---|---|
| Button primary | nền `accent`, chữ `#0a0a0b` (không dùng chữ trắng trên xanh), 700, radius 0, padding 9×16; hover: nền sáng hơn + dịch `translate(-1px,-1px)` và bóng 3px; active: bóng 0 |
| Button secondary | nền trong suốt, viền 1px `line-strong`, chữ `fg`; hover nền `hover` |
| Button danger (Kill-Switch) | nền `danger` đặc, chữ trắng đậm, bóng cứng 5px, cỡ lớn; hiện finality đo được dưới nút |
| Tabs / segmented | nhóm viền liền; active = nền `ink`(kem) chữ `#0a0a0b`; sub-nav: gạch chân 2px `accent` |
| Card | `surface` + viền 1px `line` + `--shadow-hard`; tiêu đề h3 sans, mô tả `soft`, footer link `accent` đậm |
| Badge (khối) | vuông đặc mono 11px uppercase: xanh (`LIVE`), đỏ (`BLOCKED`), vàng (`NEXT UP`), kem (số thứ tự `01`) |
| Count pill | **ngoại lệ duy nhất được bo tròn**: nền `highlight`, chữ đen, mono nhỏ |
| Tag / chip | pill viền 1px, mono 11px, nền trong suốt |
| Input / Select | `surface`, viền `line-strong`, radius 0, focus: ring 2px `highlight`; lỗi: viền `danger` + text lỗi tiếng Việt |
| Table / list | hàng ngăn bằng đường kẻ `line`, cột nhãn mono muted bên trái; mục đã qua gạch ngang |
| Notice | nền `highlight`, viền đen, chữ `#141414` |
| Progress / BudgetBar | thanh 5–10 ô vuông hoặc thanh phẳng viền 1px; đầy = `ok` → `warn` ≥ 80% → `danger` ≥ 100%; nhãn `spent / cap` mono |
| Dialog / Toast | `surface`, viền `line-strong`, bóng cứng; toast mép trái 4px màu trạng thái |
| Verdict stamp (`shared/ui/Stamp`) | con dấu cao su: viền 2px + viền ngoài 1px, mono đậm uppercase, xoay -3°, animation `stamp-in` 200ms khi xuất hiện; luôn kèm chữ `APPROVE`/`BLOCKED` |
| Corner brackets (`Chamfer code="…"`) | hai dấu ngắm `┌ ┘` ở hai góc không bị cắt + mã mono (`SEC-0412 / LIVE`, `ATK-01`, `STEP 02`) |
| Shield rail | đường nét đứt có gói tin vuông: xanh đi hết, đỏ chết tại cổng Shield 2 (chỉ desktop, trang trí, `aria-hidden`) |
| Kill zone | khung sọc hazard đỏ/nền bao quanh khối Kill-Switch; đây là nơi đỏ nhiều nhất trên trang |
| Skeleton | khối vuông `hover`, nhấp nháy opacity |
| Hero (nếu có) | nền blueprint (lưới 32px + glow xanh lục, tọa độ A–F ở mép trên), tiêu đề poster in nghiêng uppercase với dòng thứ hai chữ rỗng (`outline-text`), dòng phụ mono uppercase; **LiveFeed**: khung terminal vuông phát lần lượt các dòng giao dịch (`APPROVE` xanh / `BLOCKED` đỏ), tĩnh khi `prefers-reduced-motion` |

## 4. Pattern riêng AgentShield
- **Verdict card:** APPROVE = viền/nhãn `ok`, tiêu đề "An toàn, tiêu 13,3% hạn mức ngày"; BLOCK = viền `danger`, nền `tint-pink`, lý do ngắn gọn. Badge nguồn giải thích `LLM` / `TEMPLATE` (mono, kem).
- **Policy panel:** form input vuông, `BudgetBar` hôm nay, nút "Lưu policy" primary (ký bằng ví owner).
- **Kill-Switch:** nút danger cố định, nằm riêng một khối, không gần nút khác để tránh bấm nhầm; sau khi bấm hiện finality (~1,5 s) mono.
- **Vault before/after:** hai cột bằng nhau, số mono tabular, delta `ok`/`danger`, địa chỉ rút gọn mono + link Snowtrace.
- **Activity / job timeline:** hàng timeline: cột trái mono nhãn thời gian/trạng thái, phải tiêu đề đậm; tx revert có link Snowtrace.
- **Red-team buttons:** nút secondary, kết quả hiện flash viền 200ms (`ok` blocked đúng / `danger` lọt).
- **Giọng văn trạng thái:** kiểu báo cáo an ninh, mono uppercase: `STATUS: PROTECTED`, `LAST ATTACK BLOCKED · 2s ago`, `KILL-SWITCH ARMED`.
- Số tiền: luôn base units → format bằng helper shared (bigint), hiển thị mono; không float.

## 5. Trạng thái & a11y
- Hover = dịch bóng/đổi nền, không đổi layout. Focus-visible: ring 2px `highlight` offset 2px, không bỏ outline. Disabled: opacity 0.4 + `cursor-not-allowed`. Loading: skeleton vuông, không spinner tròn.
- Tương phản chữ ≥ 4.5:1 (đã đạt với token). Cỡ chữ demo ≥ 16px, nút ≥ 40px cao. Không dùng màu làm tín hiệu duy nhất (kèm nhãn mono hoặc icon).
- Toàn bộ chuỗi hiển thị cho người dùng bằng tiếng Việt (xem `shared/lib/error-messages.ts`).

## 6. Cấm
- Bo góc > 0 (trừ count pill/tag). Không `rounded-md/lg/xl/full` ngoài pill.
- Bóng blur (`shadow-md`, `shadow-lg`), gradient pastel, glassmorphism.
- Màu hex/Tailwind màu ngoài token (`bg-blue-500`, `#fff` tự đặt...).
- Font khác Hanken Grotesk / Geist Mono; emoji làm icon; ảnh/logo Team1 hoặc Avalanche.
- Chữ tiêu đề mảnh (weight < 700) hoặc tracking dương cho h1–h3.

## 7. Ví dụ
```tsx
// Đúng
<button className="bg-accent text-white font-bold px-4 py-2 rounded-none hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm active:translate-0 active:shadow-none">
  Lưu policy
</button>
<div className="bg-surface border border-line shadow-hard p-6">
  <span className="font-mono text-[11px] uppercase tracking-widest text-muted">Hạn mức ngày</span>
</div>

// Sai
<button className="rounded-lg bg-blue-500 shadow-lg">Save</button>
```

## 8. Triển khai
- Token cài đặt trong `apps/web/src/styles/index.css` (`@theme` Tailwind v4 + `:root` + `[data-theme=light]`). Component shadcn đặt ở `apps/web/src/shared/ui/`, đã override radius 0 và shadow-hard; thêm component mới bằng skill `shadcn-ui` rồi chỉnh theo bảng ở §3.
- Review trước merge: `design-review` có checklist thị giác; `web-design-guidelines` cho a11y/UX.
