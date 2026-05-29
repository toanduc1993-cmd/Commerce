---
name: ui-ux-vn
description: UI/UX design optimized for Vietnamese business applications. Enterprise dashboards, B2B tools, form-heavy interfaces, data tables. Applies Vietnamese cultural conventions, typography, and user behavior patterns for internal business systems.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# UI/UX for Vietnamese Business Applications

> "Vietnamese business users expect clarity, density, and trustworthiness — not trendy aesthetics."

---

## 🎯 When to Use This Skill

Use this skill for:
- **Internal management systems** (quản lý nội bộ)
- **Data-heavy dashboards** (bảng điều khiển báo cáo)
- **Form-driven workflows** (nhập liệu, phê duyệt)
- **Financial/accounting interfaces** (kế toán, hóa đơn, hợp đồng)
- **Document management** (quản lý hồ sơ)

---

## 1. Vietnamese User Behavior Patterns

| Behavior | Design Response |
|----------|----------------|
| **High information density preference** | Dense tables with more columns (unlike Western minimal) |
| **Trust via familiarity** | Match Excel-like layouts they already know |
| **Number formatting**: `1.000.000 VNĐ` | Use Vietnamese number format (period = thousand separator) |
| **Print-first mindset** | Design for printable reports (A4 landscape) |
| **Mobile secondary** | Desktop-first for office work; mobile for approvals |
| **Date format**: `dd/mm/yyyy` | Always format dates Vietnamese style in UI |

---

## 2. Typography for Vietnamese UI

### Font Recommendations (Vietnamese Unicode support)

| Font | Use Case | Weight |
|------|----------|--------|
| **Be Vietnam Pro** | Primary UI, forms, labels | 400, 500, 600 |
| **Inter** | Data tables, numbers | 400, 500 |
| **Noto Sans** | Fallback for Vietnamese glyphs | 400, 700 |
| **Times New Roman** | Document/report exports | 400, 700 |

### Type Scale for Business UI

```css
--text-xs:   12px;  /* Labels, helpers */
--text-sm:   13px;  /* Table cells */
--text-base: 14px;  /* Body, forms */
--text-lg:   16px;  /* Section headers */
--text-xl:   18px;  /* Page titles */
--text-2xl:  22px;  /* Dashboard KPIs */
```

> ⚠️ **No smaller than 12px** — older users in Vietnamese offices often have screen accessibility needs.

---

## 3. Color System for Vietnamese B2B

### Recommended Palettes

**Option A: Professional Blue (Trust/Authority)**
```css
--primary:    #1E3A5F;   /* Deep navy — authority */
--primary-lt: #2563EB;   /* Action blue */
--accent:     #F59E0B;   /* Amber — highlights, badges */
--success:    #16A34A;   /* Green — completed, profit */
--danger:     #DC2626;   /* Red — errors, deficit */
--neutral:    #F8FAFC;   /* Background */
--border:     #E2E8F0;   /* Table borders */
```

**Option B: Corporate Green (Finance/Construction)**
```css
--primary:    #14532D;   /* Dark green — trust */
--primary-lt: #16A34A;   /* Action green */
--accent:     #D97706;   /* Orange — alert */
--success:    #15803D;
--danger:     #B91C1C;
--neutral:    #F9FAFB;
```

### Vietnamese Status Colors

| Status | Color | Use For |
|--------|-------|---------|
| Hoàn thành | `#16A34A` green | Paid, completed |
| Đang xử lý | `#2563EB` blue | In progress |
| Chưa xử lý | `#6B7280` gray | Pending |
| Phát sinh | `#F59E0B` amber | Additions |
| Khấu trừ | `#DC2626` red | Deductions |
| Tạm giữ | `#7C3AED` purple | Retained |

---

## 4. Data Table Design (Critical for VN Business Apps)

Vietnamese business apps are **table-heavy**. Follow these rules:

### Table Structure Pattern

```html
<!-- Header pattern -->
<tr>
  <th>STT</th>          <!-- Serial number, fixed 50px -->
  <th>Mô tả</th>         <!-- Description, flexible -->
  <th>ĐVT</th>           <!-- Unit, fixed 60px -->
  <th>KL</th>            <!-- Qty, fixed 80px, right-align -->
  <th>Đơn giá</th>        <!-- Unit price, fixed 120px, right-align -->
  <th>Thành tiền</th>     <!-- Total, fixed 130px, right-align, bold -->
  <th></th>              <!-- Actions column -->
</tr>
```

### Number Formatting Rules

```javascript
// Vietnamese currency format
const formatVND = (num) =>
  new Intl.NumberFormat('vi-VN').format(num) + ' đ';
// Output: "1.500.000 đ"

// Short format for tables
const formatShort = (num) => {
  if (num >= 1_000_000_000) return (num/1e9).toFixed(1) + ' tỷ';
  if (num >= 1_000_000) return (num/1e6).toFixed(1) + ' triệu';
  return new Intl.NumberFormat('vi-VN').format(num);
};
```

### Table UX Rules

- ✅ Sticky header on scroll
- ✅ Alternating row colors (`#F9FAFB` / white)
- ✅ Hover highlight (`#EFF6FF`)
- ✅ Right-align all numeric columns
- ✅ Footer row with totals (bold, background `#FEF3C7`)
- ✅ Sortable columns for date and amount
- ✅ Filter/search above table
- ❌ No pagination if < 500 rows (Vietnamese users prefer one scroll)
- ❌ No horizontal scroll — fit columns to screen width

---

## 5. Form Design for Vietnamese Input

### Field Labels (above, not inline)

```
❌ WRONG: [Tên hợp đồng_______________]
✅ RIGHT:  Số hợp đồng *
           [01/2026/HD-IBS______________]
           Ví dụ: 01/2026/HD-IBS-ABC
```

### Required Field Indication

```
Label * ← red asterisk, tooltip explains "Bắt buộc"
```

### Date Input

```html
<!-- Always show Vietnamese hint -->
<input type="date" placeholder="dd/mm/yyyy"/>
<small>Ngày ký hợp đồng</small>
```

### Money Input

```html
<!-- Vietnamese currency input -->
<div class="input-group">
  <input type="number" placeholder="0" step="1000"/>
  <span class="suffix">VNĐ</span>
</div>
<!-- Show formatted preview: "= 1.500.000 VNĐ" -->
```

---

## 6. Dashboard Layout for Finance/Reporting

### KPI Card Pattern

```
┌─────────────────────────────────────────────────────┐
│  [Icon]  Tổng giá trị hợp đồng         ↑ +12% MoM  │
│          1.250.000.000 VNĐ                          │
│          ████████████░░░░  75% đã thanh toán        │
└─────────────────────────────────────────────────────┘
```

### Page Layout (Admin/Management)

```
[Sidebar 240px fixed] | [Main content area]
                         ├── [Breadcrumb]
                         ├── [Page title + Actions]
                         ├── [Filter bar]
                         └── [Content: table/form/report]
```

### Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| `> 1280px` | Full sidebar + content |
| `1024-1280px` | Collapsed sidebar (icons only) |
| `< 1024px` | Drawer sidebar (mobile) |

---

## 7. Micro-interactions for Vietnamese Users

| Action | Interaction |
|--------|------------|
| Form submit | Loading spinner + "Đang xử lý..." |
| Upload success | Toast: "✅ Upload thành công" |
| Upload fail | Alert modal with error detail (Vietnamese) |
| Delete | Confirmation modal: "Bạn có chắc muốn xóa? Hành động này không thể hoàn tác." |
| Export | Button changes to "⏳ Đang xuất..." → download auto-starts |
| Auto-save | Subtle indicator "Đã lưu lúc 10:30" |

---

## 8. Vietnamese Error Messages

Always write errors in Vietnamese, actionable:

```
❌ Bad:  "Error 400: Bad Request"
✅ Good: "Vui lòng chọn dự án trước khi upload hợp đồng."

❌ Bad:  "File format not supported"
✅ Good: "Định dạng file không được hỗ trợ. Vui lòng chọn file PDF, DOC, hoặc DOCX."

❌ Bad:  "Network error"
✅ Good: "Kết nối máy chủ thất bại. Vui lòng kiểm tra mạng và thử lại."
```

---

## 9. Print/Export Design

Vietnamese business heavily uses printed reports:

```css
@media print {
  body { font-family: 'Times New Roman', serif; font-size: 12px; }
  .sidebar, .actions, .filters { display: none !important; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 4px 8px; }
  .page-break { page-break-before: always; }
}
```

---

## 📋 VN Business UI Checklist

- [ ] Vietnamese typography (Be Vietnam Pro / Inter)
- [ ] Number format: `1.000.000 VNĐ` style
- [ ] Date format: `dd/mm/yyyy` in UI display
- [ ] Table has sticky header + alternating rows + total footer
- [ ] Error messages in Vietnamese and actionable
- [ ] Form labels above inputs, not inline
- [ ] Print CSS defined for reports
- [ ] Loading states for all async actions
- [ ] Delete/destructive actions have confirmation modal

---

## 🔗 Related Skills

| Skill | When to Use |
|-------|-------------|
| `@[skills/frontend-design]` | General design principles |
| `@[skills/web-design-guidelines]` | Accessibility audit after coding |
| `@[skills/system-analysis]` | Define use cases before designing UI |
