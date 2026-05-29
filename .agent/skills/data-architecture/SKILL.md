---
name: data-architecture
description: Data architecture and modeling. Use when designing data models, ER diagrams, data warehouses, ETL pipelines, reporting schemas, or analyzing data relationships. Goes deeper than database-design — covers the full data layer strategy.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Data Architecture Framework

> "Data is an asset. Architecture determines its value."

---

## 🎯 Selective Reading Rule

| File | Description | When to Read |
|------|-------------|--------------|
| `entity-modeling.md` | ER diagrams, entity relationships, normalization | Data model design |
| `oltp-vs-olap.md` | Transactional vs Analytical data decisions | Reporting vs operations |
| `data-dictionary.md` | Field naming, types, constraints conventions | Schema documentation |
| `migration-strategy.md` | Safe schema migration patterns | DB changes |

---

## 🧠 Data Architecture Decision Tree

```
What is the PRIMARY use?
├── WRITE HEAVY (user operations) → OLTP / Normalized
├── READ HEAVY (reporting) → OLAP / Denormalized / Views
└── BOTH → CQRS pattern (separate read/write models)
```

---

## 1. Entity Relationship Modeling

### Relationship Types

| Type | Notation | Example (this system) |
|------|----------|-----------------------|
| One-to-One (1:1) | `——||——||——` | (none in current system) |
| One-to-Many (1:N) | `——||——<` | Project → Contracts |
| Many-to-Many (M:N) | `>——<` | (via junction table) |

### Current System ER (IBS Subcontractor)

```
[Project] 1──────< [Contract] 1──────< [ContractItem]
                       │
                       ├──────< [Form1Record] 1──────< [Form1Item]
                       │
                       ├──────< [Form2Record]
                       │
                       └──────< [PhatSinh]
```

### Normalization Levels

| Normal Form | Rule | Apply When |
|-------------|------|------------|
| **1NF** | No repeating groups, atomic values | Always |
| **2NF** | No partial dependencies (composite PK) | Multi-column PKs |
| **3NF** | No transitive dependencies | Standard OLTP |
| **Denormalized** | Intentional redundancy for speed | Reporting tables |

---

## 2. Data Dictionary Standard

Every field should be documented:

```
Table: contracts
Field: total_value
  Type: FLOAT
  Nullable: NO
  Default: 0.0
  Unit: VND (Vietnamese Dong)
  Description: Tổng giá trị hợp đồng TRƯỚC thuế VAT
  Business Rule: Must be > 0 for active contracts
  Source: OCR extraction or manual input
```

### Field Naming Conventions (This Project)

| Pattern | Example | Meaning |
|---------|---------|---------|
| `*_id` | `contract_id` | Foreign key reference |
| `*_at` | `created_at` | Timestamp fields |
| `*_date` | `sign_date` | Date-only fields (string YYYY-MM-DD) |
| `*_amount` | `total_amount` | Monetary values (VND) |
| `*_rate` | `vat_rate` | Percentage values |
| `*_no` | `contract_no` | Document numbers |
| `month` | `2026-03` | Period reference (YYYY-MM) |
| `type` | `phat_sinh` / `khau_tru` | Enum-like discriminators |

---

## 3. Reporting Data Design

### Current Reporting Pattern (IBS)

```
Report Query Flow:
Projects → filter by project_id
  └→ Contracts → filter by project_id
       └→ Form1Records → filter by month
       │     └→ Form1Items → join with ContractItems (fuzzy match)
       └→ PhatSinh → filter by type & month

Aggregations:
  paid_amount = SUM(qty × unit_price) per contract
  phat_sinh   = SUM(amount) WHERE type='phat_sinh'
  khau_tru    = SUM(amount) WHERE type='khau_tru'
  remaining   = total_value - paid - phat_sinh + khau_tru
```

### Recommended: Add Materialized Summary Table

For performance at scale, add `ContractSummary`:
```sql
CREATE TABLE contract_summary (
  contract_id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  paid_amount FLOAT DEFAULT 0,
  phat_sinh_amount FLOAT DEFAULT 0,
  khau_tru_amount FLOAT DEFAULT 0,
  remaining FLOAT DEFAULT 0,
  last_calculated_at DATETIME,
  FOREIGN KEY (contract_id) REFERENCES contracts(id)
);
```
→ Recalculate on each Form1/PhatSinh write.

---

## 4. Data Quality Rules

| Rule | Field | Constraint |
|------|-------|-----------|
| Month format | `month` | Must match `^\d{4}-\d{2}$` |
| VAT rate | `vat_rate` | Between 0 and 30 |
| Amounts | `total_value`, `total_amount` | Non-negative float |
| Dates | `sign_date`, `completion_date` | ISO format `YYYY-MM-DD` or NULL |
| UUIDs | All `id` fields | Valid UUID v4 format |
| Contract number | `contract_no` | Non-empty string |

---

## 5. Data Flow for This System

```
INPUT SOURCES:
  ├── PDF Contract (OCR via Gemini → regex fallback)
  ├── Excel BM1/BM2 (openpyxl parser)
  ├── Manual form input (JSON via API)
  └── Manual PhatSinh entry

STORAGE:
  ├── SQLite (current — single file, no concurrency)
  └── [Recommended] PostgreSQL (for multi-user)

OUTPUT:
  ├── Excel Reports (openpyxl exporter)
  │     ├── BaoCaoTongHop (3 sheets)
  │     ├── BaoCaoGiaTri
  │     └── HoSoThanhToan
  └── JSON API responses (for frontend)
```

---

## 6. Migration Strategy (SQLite → PostgreSQL)

When scaling beyond single-user:

```
Step 1: Export SQLite → CSV per table
Step 2: Create PostgreSQL schema (same models)
Step 3: Update DATABASE_URL in .env
Step 4: Import CSVs (handle UUID format differences)
Step 5: Add connection pooling (SQLAlchemy pool_size=5)
Step 6: Test all API endpoints
```

Key changes needed:
- UUID type: SQLite uses TEXT, PostgreSQL has native UUID
- `FLOAT` → `NUMERIC(15,2)` for precise financial values
- Add `INDEX` on `contract_id`, `month`, `project_id`

---

## 📋 Data Architecture Checklist

- [ ] ER diagram covers all entities and relationships
- [ ] All fields in data dictionary
- [ ] Normalization level chosen and justified
- [ ] Reporting queries analyzed for N+1 issues
- [ ] Data quality rules documented
- [ ] Migration path planned (if applicable)
- [ ] Indexes defined for frequent query patterns

---

## 🔗 Related Skills

| Skill | When to Use |
|-------|-------------|
| `@[skills/database-design]` | ORM selection, indexing |
| `@[skills/system-analysis]` | Requirements before data modeling |
| `@[skills/api-patterns]` | API design based on data model |

---

## ⚠️ Anti-Patterns

❌ Store money as FLOAT without knowing precision needs (use NUMERIC for critical financial)  
❌ No data dictionary — teams can't agree on field meaning  
❌ Recalculate reports from raw data at query time without indexing  
❌ Use string concatenation to build SQL (SQL injection risk)  
❌ Ignore data retention policy — GDPR/compliance requirement  
