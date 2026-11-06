---
name: ui-design-system
description: MANDATORY visual design system for AgentShield (style "Sentinel Terminal", brutalist base inspired by team1vn.xyz but with its own green identity) - dark charcoal "Carbon Paper" background (warm #17140f, cream hard shadow) with a light "Day Blueprint" twin, square corners, 1px borders, hard offset shadows, green accent (red only for danger), Hanken Grotesk + Geist Mono. Read BEFORE creating or editing any UI in apps/web - components, pages, layouts, Tailwind classes, shadcn components, colors, fonts, spacing, motion, empty/loading/error states. Overrides frontend-design, shadcn defaults and web-design-guidelines on aesthetics.
paths: "apps/web/**"
metadata:
  owner: FS2
  source: docs/product/design-system.md
---

# UI design system (mandatory)

Full spec: `docs/product/design-system.md`. Tokens live in `apps/web/src/styles/index.css`. Precedence: `agentshield-invariants` > this skill > `frontend-design` / `shadcn-ui` / `web-design-guidelines` (those still apply for a11y, structure and shadcn mechanics, never for choosing a different look). Do not invent a new aesthetic.

## Before writing UI
1. Read `docs/product/design-system.md` sections 2-4 (tokens, components, AgentShield patterns).
2. Use only token classes: `bg-bg bg-surface bg-hover text-fg text-soft text-muted border-line border-line-strong bg-accent bg-danger text-danger text-ok text-warn bg-highlight bg-tint-*`, `font-sans font-mono`, `shadow-hard shadow-hard-sm`.
3. Add components with `shadcn-ui`, then conform them to the rules below.

## Hard rules
- **Square corners.** `rounded-none` everywhere. Only count pills (`rounded-pill`, highlight bg, black text) and tag chips are rounded.
- **Shield cut:** featured cards/buttons use `shared/ui/Chamfer` (chamfered top-right + bottom-left via `.chamfer`, shadow via `.drop-hard`). Never put `shadow-hard` on a clip-pathed element (it gets clipped).
- **Borders:** 1px `border-line`; emphasis `border-line-strong`. Cards = `bg-surface border border-line shadow-hard`.
- **Shadows:** hard offset only (`shadow-hard` 5px, `shadow-hard-sm` 3px, black, zero blur). Never `shadow-md/lg/xl`.
- **Color:** no hex or Tailwind palette colors (`blue-500`, `#fff`). Green `accent` (= `ok`) = brand, primary action, links, APPROVE/safe. Red `danger` = ONLY BLOCK, revert, Kill-Switch, errors. Amber `warn` = caution. `highlight` yellow = counts, notices, focus ring.
- **Type:** Hanken Grotesk for text (headings weight 800-900, tracking -2%), Geist Mono for numbers, addresses, hashes, labels, badges (11px, uppercase, wide tracking). Money always `font-mono tabular`.
- **Two themes, always.** Every UI must work in dark (Carbon Paper) and light (Day Blueprint) via tokens only. Check both before finishing. Use `text-accent-text` / `text-danger-text` for colored text (not `text-accent`/`text-danger`), `text-on-accent` on green fills. Hard shadow color comes from `--shadow-color` (cream in dark, ink in light).
- **Signature details:** `Stamp` for verdicts, `Chamfer code="…"` brackets, `.blueprint` hero field (no glow/radar), `.hazard` only around Kill-Switch, `.outline-text` for poster headlines.
- **Mascot Aura-kun** (`shared/mascot/`): follow design-system §4b. SVG only, theme tokens only (incl. `--blush`), English lines (<= 24 chars), no emoji, one global instance in `AuraLayer` (never per page). Mark new standable surfaces with `data-ground="<unique-id>"` (Chamfer has a `ground` prop). Respect reduced motion.
- **Primary button:** `bg-accent text-on-accent font-bold` (dark text on green, never white), hover dips by `-translate-x-px -translate-y-px` with smaller shadow, active flattens. Secondary: transparent + `border-line-strong`.
- **Motion:** <= 200ms, flash/slide/shadow-shift only, honor `prefers-reduced-motion` (already global). No bounce, no spinners (use square skeletons).
- **Focus:** keep `:focus-visible` yellow ring; never remove outlines.
- **Projector legibility:** demo text >= 16px, buttons >= 40px tall, contrast >= 4.5:1, never color as the only signal.
- **Copy:** user-facing strings in Vietnamese.
- **Icons:** lucide only, no emoji. No Team1/Avalanche logos or images.

## Checklist before finishing a UI change
- [ ] grep the diff: no `rounded-(sm|md|lg|xl|2xl|3xl|full)` (except count pill/tag), no `shadow-(sm|md|lg|xl|2xl)`, no `#[0-9a-f]{3,8}` or `(blue|gray|slate|zinc|green|red|...)-\d{2,3}` in `apps/web/src` outside `styles/index.css`
- [ ] screenshot checked in BOTH light and dark, desktop and phone width (no horizontal scroll)
- [ ] fonts only `font-sans` / `font-mono`
- [ ] states done: hover, focus-visible, disabled, loading, empty, error
- [ ] AgentShield patterns follow design-system section 4 (verdict card, BudgetBar, Kill-Switch, `llm|template` badge)
- [ ] ran `web-design-guidelines` review for a11y, then manual `design-review` before merge

## Quick pattern
```tsx
<div className="bg-surface border border-line shadow-hard p-6">
  <span className="mono-label">Hạn mức ngày</span>
  <p className="tabular text-3xl font-bold">13,3%</p>
  <button className="mt-4 bg-accent text-on-accent font-bold px-4 py-2 rounded-none hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm active:translate-x-0 active:translate-y-0 active:shadow-none">Lưu policy</button>
</div>
```
