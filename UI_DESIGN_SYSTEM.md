# UI_DESIGN_SYSTEM.md — Tokens reference (UI-1-1)

> **Created:** 2026-05-25 Phase C kick-off
> **File source of truth:** [frontend/src/app/globals.css](frontend/src/app/globals.css) `@theme` block
> **Scope:** Replace `text-[9..11px] font-black uppercase` sprawl + 6+ ad-hoc colors

---

## Typography scale (6 levels, min 12px)

| Token | Size | Use case | Tailwind utility |
|---|---|---|---|
| `--text-caption` | 12px | Metadata, helper hints, timestamps | `.text-caption` |
| `--text-body` | 14px | Default body, regular table cells | `.text-body` |
| `--text-emphasis` | 14px / 600 | Highlighted table cells, important inline | `.text-emphasis` |
| `--text-h3` | 16px / 600 | Card title | `.text-h3` |
| `--text-h2` | 20px / 700 | Section title | `.text-h2` |
| `--text-h1` | 24px / 800 | Page title | `.text-h1` |
| `--text-display` | 32px / 800 | KPI number | `.text-display` |

**Anti-pattern (đang bị abuse trong codebase):**
```jsx
<div className="text-[9px] font-black uppercase tracking-widest text-slate-400">
  GROUP LABEL
</div>
```

**Pattern mới:**
```jsx
<div className="label">GROUP LABEL</div>
```

---

## Semantic colors (5 channels)

| Token | Color | Use case | Badge utility |
|---|---|---|---|
| `--color-brand` | `#1B365D` navy | Logo, primary CTA, brand identity | `.badge-brand` |
| `--color-info` | `#0D6EFD` blue | Hyperlink, selected state, neutral info | `.badge-info` |
| `--color-success` | `#198754` green | DONE, PAID, APPROVED, COMPLETED | `.badge-success` |
| `--color-warning` | `#FD7E14` orange | Pending, DRAFT, IN_PROGRESS | `.badge-warning` |
| `--color-danger` | `#DC2626` red | OVERDUE, REJECTED, CANCELLED, errors | `.badge-danger` |

Mỗi channel có 3 variant: base, `-fg` (text-on-base), `-soft` (background variant).

**Anti-pattern:**
```jsx
{ label: 'Dự án',           color: '#1B365D' }  // navy
{ label: 'Yêu cầu mua hàng', color: '#0d6efd' }  // blue
{ label: 'Đơn đặt hàng',     color: '#198754' }  // green
{ label: 'Hợp đồng',         color: '#fd7e14' }  // orange  ← all KPI cards different color = no semantic meaning
```

**Pattern mới**: All KPI cards = brand color background, status badges = semantic. Visual hierarchy đến từ size + position.

---

## Spacing scale (4px base, geometric)

| Token | Value | Use case |
|---|---|---|
| `--space-1` | 4px | Tight inline gap |
| `--space-2` | 8px | Inline gap |
| `--space-3` | 12px | Compact card padding |
| `--space-4` | 16px | Default card padding |
| `--space-6` | 24px | Section gap |
| `--space-8` | 32px | Page margin |
| `--space-12` | 48px | Major separator |

---

## Workflow step colors (7-step progress timeline UI-2-1)

| State | Color | Token |
|---|---|---|
| Done (bước đã qua) | green | `--step-done` |
| Active (đang ở bước này) | blue | `--step-active` |
| Pending (chưa tới) | slate-300 | `--step-pending` |

Example usage:
```jsx
<div className="flex gap-1">
  {[1,2,3,4,5,6,7].map(step => (
    <span
      key={step}
      className="w-2 h-2 rounded-full"
      style={{ background:
        step < current ? 'var(--step-done)' :
        step === current ? 'var(--step-active)' : 'var(--step-pending)'
      }}
    />
  ))}
</div>
```

---

## Migration guide (current code → design system)

### 1. Replace text size sprawl

| Đang dùng | Đổi thành |
|---|---|
| `text-[9px] font-black uppercase tracking-widest text-slate-400` | `.label` |
| `text-[10px] text-slate-400` | `.text-caption` |
| `text-[11px]` for body | `.text-body` |
| `text-2xl font-black text-[#1B365D]` | `.text-h2` |
| `text-3xl font-black text-[#1B365D]` | `.text-display` |

### 2. Replace random status colors

| Đang dùng | Đổi thành |
|---|---|
| Hardcoded `#198754` cho FULLY_RECEIVED | `var(--color-success)` |
| Hardcoded `#fd7e14` cho PARTIAL_RECEIVED | `var(--color-warning)` |
| Hardcoded `#dc3545` cho CANCELLED | `var(--color-danger)` |
| `bg-green-100 text-green-800` status badge | `.badge-success` |

### 3. KPI cards uniform style

```jsx
// Before — 4 cards 4 màu
<div className="bg-white border-l-4" style={{ borderLeftColor: '#1B365D' }}>...</div>
<div className="bg-white border-l-4" style={{ borderLeftColor: '#0d6efd' }}>...</div>
// ...

// After — all brand color, semantic distinction via icon + position
<div className="bg-white border-l-4 border-brand rounded-lg p-4 shadow-sm">
  <span className="material-symbols-outlined text-h2" style={{ color: 'var(--color-brand)' }}>
    folder_open
  </span>
  <div className="label">Dự án</div>
  <div className="text-display">52</div>
  <div className="text-caption">38 đang hoạt động</div>
</div>
```

---

## Files updated for Sprint UI-1-1

- `frontend/src/app/globals.css` — added 50 CSS variables + 8 utility classes
- `VẬT TƯ/UI_DESIGN_SYSTEM.md` — this doc

## Sprint UI-1 dependencies (next tasks)

- **UI-1-2** Workflow-first sidebar — uses `.label` + `.badge-*`
- **UI-1-3** Workspace selector — uses `.text-h3` + `.badge-brand` for project chip
- **UI-1-4** Cmd+K palette — uses `.text-body` + `.text-caption` for results

## Verification

```sh
# Frontend dev server → inspect element on any page should show new vars available
curl -s http://localhost:3001/login | grep -o "globals.css"
# Browser DevTools: check `:root` computed styles có `--text-display`, `--color-brand`, etc
```
