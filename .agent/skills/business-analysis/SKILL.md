---
name: business-analysis
description: Business analysis for construction/engineering/finance domain. Use when analyzing construction contract workflows, subcontractor payment processes, cost tracking, volume completion reporting (BM1/BM2), or any domain-specific business process in the Vietnamese construction industry.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Business Analysis — Construction & Subcontractor Domain

> "Know the domain before coding the domain."

---

## 🎯 Domain Context

This workspace operates in **Vietnamese construction subcontractor management**. Key business concepts:

---

## 1. Domain Glossary

| Vietnamese Term | Definition | System Mapping |
|-----------------|------------|----------------|
| **Hợp đồng (HĐ)** | Contract | `Contract` model |
| **Thầu phụ** | Subcontractor (Bên B) | `Contract.subcontractor` |
| **Dự án** | Project | `Project` model |
| **KL hoàn thành** | Completed volume/quantity | `Form1Item.current_completed_qty` |
| **BM1** | Form 1 — Volume completion report | `Form1Record` |
| **BM2** | Form 2 — Value completion report | `Form2Record` |
| **Phát sinh** | Additional work (cost addition) | `PhatSinh.type = 'phat_sinh'` |
| **Khấu trừ** | Deduction (retention, penalty) | `PhatSinh.type = 'khau_tru'` |
| **Lũy kế** | Cumulative (to-date total) | Aggregated from all months |
| **Tháng này** | Current month | `Form1Record.month = YYYY-MM` |
| **Đơn giá** | Unit price | `ContractItem.unit_price` |
| **Thành tiền** | Line total (qty × price) | Calculated field |
| **VAT** | Value Added Tax (10% standard) | `Contract.vat_rate` |
| **Giá trị trước thuế** | Pre-tax value | `total_value` |
| **Nghiệm thu** | Acceptance/completion inspection | Business process (not yet in system) |
| **Tạm ứng** | Advance payment | Not yet in system |
| **Quyết toán** | Final settlement | End-of-project reconciliation |

---

## 2. Core Business Processes

### Process A: Contract Lifecycle

```
[Bidding Won] 
    → Ký hợp đồng (sign_date)
    → Nhập hợp đồng vào hệ thống (Upload PDF / manual)
    → Triển khai thi công
    → Nghiệm thu từng đợt (BM1/BM2 monthly)
    → Thanh toán theo nghiệm thu
    → Quyết toán cuối dự án
```

### Process B: Monthly Payment Cycle

```
[Cuối tháng M]
    → Thầu phụ nộp BM1 (upload Excel/PDF)
    → Kế toán kiểm tra khối lượng
    → Tính giá trị = KL × Đơn giá HĐ
    → Cộng phát sinh (nếu có)
    → Trừ khấu trừ (nếu có)
    → Cộng VAT
    → Xuất hồ sơ thanh toán
    → Phê duyệt & thanh toán
```

### Process C: Report Generation Flow

```
Input: project_id (optional), month (optional)
    → Query DB: Projects → Contracts → Form1/PhatSinh
    → Aggregate per contract:
        paid = Σ(qty × unit_price) from Form1Items
        phat_sinh = Σ(amount) where type='phat_sinh'
        khau_tru = Σ(amount) where type='khau_tru'
        remaining = total_value - paid - phat_sinh + khau_tru
    → Export Excel (3 sheets: By Contract / By Sub / By Project)
```

---

## 3. Business Rules

| Rule ID | Rule | Enforcement |
|---------|------|-------------|
| BR-001 | VAT mặc định 10% nếu không ghi trong HĐ | `vat_rate default=10.0` |
| BR-002 | Tháng phải ở định dạng YYYY-MM | `normalize_month()` |
| BR-003 | Khối lượng hoàn thành không vượt khối lượng HĐ | ⚠️ Not yet enforced |
| BR-004 | Phát sinh cần ghi rõ mô tả | `description NOT NULL` |
| BR-005 | File upload tối đa 16MB | `MAX_CONTENT_LENGTH` |
| BR-006 | Chỉ chấp nhận PDF/DOCX cho HĐ; PDF/XLSX cho BM | `ALLOWED_*_EXTS` |
| BR-007 | Giá trị còn lại = GTRDONG - Đã TT - Phát sinh + Khấu trừ | `_build_report_data()` |

---

## 4. Missing Business Rules (Gaps Identified)

These business rules exist in practice but are not yet in the system:

| Gap | Business Need | Recommended Fix |
|-----|---------------|-----------------|
| **BR-003** | KL hoàn thành ≤ KL hợp đồng | Add validation in `/api/form1` POST |
| **Tạm ứng** | Advance payment tracking | Add `advance_payment` to `Contract` |
| **Nghiệm thu** | Formal acceptance status per period | Add `AcceptanceRecord` model |
| **Phê duyệt** | Approval workflow for payments | Add `status` field + approval flow |
| **Tháng thanh toán** | Which month was actually paid? | Add `payment_date` to Form1Record |
| **Số chứng từ** | Invoice/receipt number | Add `invoice_no` to Form1Record |

---

## 5. Stakeholder Map

| Stakeholder | Role | System Interaction |
|-------------|------|-------------------|
| **Kế toán (Accountant)** | Primary user — data entry | Upload HĐ, nhập BM1, xuất báo cáo |
| **Giám đốc (Director)** | Report consumer | View dashboard, approve payments |
| **Thầu phụ (Subcontractor)** | External — submits BM1 | Upload via system (or via Kế toán) |
| **Quản lý dự án (PM)** | Project oversight | View by-project reports |
| **Kiểm toán (Auditor)** | Compliance review | Export audit trails + hồ sơ |

---

## 6. Compliance & Reporting Requirements (Vietnamese)

| Requirement | Standard | Impact |
|-------------|----------|--------|
| VAT reporting | Thông tư 78/2021/TT-BTC | VAT fields must be accurate |
| Contract retention | Luật Lưu trữ — 10 years | No hard-delete on contracts |
| Payment documentation | Nghị định 37/2015 | BM1/BM2 mandatory before payment |
| Audit trail | MOF requirements | All changes should be logged |

---

## 📋 Business Analysis Checklist

- [ ] All Vietnamese domain terms understood and mapped to code
- [ ] Business process flows documented (happy path + exceptions)
- [ ] Business rules enumerated and enforcement verified
- [ ] Gaps identified and prioritized
- [ ] Stakeholder interactions mapped
- [ ] Compliance requirements noted

---

## 🔗 Related Skills

| Skill | When to Use |
|-------|-------------|
| `@[skills/system-analysis]` | Translate business analysis → system requirements |
| `@[skills/data-architecture]` | Map business entities → data models |
| `@[skills/ui-ux-vn]` | Design UI matching Vietnamese business workflows |
