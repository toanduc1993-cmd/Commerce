---
name: system-analysis
description: System analysis and requirements engineering. Use when analyzing business processes, gathering requirements, writing use cases, designing data flows, or creating system specifications. Applies to both new systems and legacy analysis.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# System Analysis Framework

> "Understand the problem completely before touching the solution."

---

## 🎯 Selective Reading Rule

| File | Description | When to Read |
|------|-------------|--------------|
| `requirements.md` | Requirements gathering templates, user stories | New feature / system design |
| `process-modeling.md` | BPMN, swimlane, flowchart patterns | Business process analysis |
| `data-flow.md` | DFD, context diagrams, entity mapping | Data flow & integration analysis |
| `use-cases.md` | Use case templates, actors, scenarios | Functional specification |

---

## 🧠 Analysis Phases (Follow Order)

### Phase 1 — Discovery
Ask before designing:

| Question | Why |
|----------|-----|
| What is the business goal? | Align solution to purpose |
| Who are the actors/users? | Define system boundaries |
| What problems exist today? | Avoid solving the wrong thing |
| What are the constraints? | Budget, time, regulation |
| What does success look like? | Measurable acceptance criteria |

### Phase 2 — Requirements Capture

**Functional Requirements (FR):**
```
FR-001: System shall allow [actor] to [action] so that [benefit]
Example: System shall allow Kế toán to upload BM1 Excel files so that khối lượng is recorded monthly.
```

**Non-Functional Requirements (NFR):**
| Category | Examples |
|----------|----------|
| **Performance** | API response < 2s, export < 5s |
| **Reliability** | 99.5% uptime, auto-retry on failure |
| **Security** | Auth required, file size limits |
| **Usability** | Vietnamese UI, mobile-friendly |
| **Data** | Backup daily, retain 3 years |

### Phase 3 — Process Modeling

**BPMN Swimlane Pattern (dùng cho workflow nghiệp vụ):**
```
Lanes: [Actor1] | [Actor2] | [System] | [External]

Start → [Task] → <Gateway> → [Task] → End
                    ↓ (else)
                 [Exception Handler]
```

**Key Flow Types:**
- **Happy path**: Normal successful flow
- **Exception path**: Error / validation fail
- **Alternative path**: Optional routes

### Phase 4 — Data Flow Analysis

**Context Diagram (Level 0):**
```
[External Entity] ──→ [SYSTEM] ──→ [External Entity]
                  ←──          ←──
Data inputs/outputs at system boundary only
```

**Level 1 DFD — expand each major process:**
```
[D1: Projects DB]
       ↓ reads
[P1: Manage Projects] → [D2: Contracts DB]
       ↑                        ↓
[User]              [P2: Process BM1] → [D3: Form1 DB]
                             ↓
                    [P3: Generate Report] → [User]
```

### Phase 5 — Use Case Specification

```
Use Case ID: UC-001
Name: Upload Hợp Đồng PDF
Actor(s): Kế toán
Precondition: Dự án đã tồn tại trong hệ thống
Trigger: User chọn file PDF và nhấn Upload

Main Flow:
1. User chọn dự án từ dropdown
2. User chọn file PDF hợp đồng
3. System gọi OCR (Gemini Vision API)
4. System trả về form điền sẵn thông tin
5. User xác nhận / chỉnh sửa
6. System lưu vào DB

Alternative Flow:
3a. Gemini không khả dụng → dùng Tesseract fallback
3b. File không phải PDF/DOCX → báo lỗi định dạng

Postcondition: Hợp đồng được lưu, items được lập trình
```

---

## 📋 Analysis Deliverables Checklist

- [ ] Business context & objective documented
- [ ] Actors and roles identified
- [ ] Functional requirements listed (FR-xxx)
- [ ] Non-functional requirements defined
- [ ] Process flows modeled (happy path + exceptions)
- [ ] Data flows documented
- [ ] Use cases written for critical scenarios
- [ ] Acceptance criteria defined per requirement

---

## 🔗 Related Skills

| Skill | When to Use |
|-------|-------------|
| `@[skills/architecture]` | After analysis → design system architecture |
| `@[skills/database-design]` | Data model from analysis findings |
| `@[skills/api-patterns]` | API design from use cases |
| `@[skills/data-architecture]` | Data layer after domain analysis |

---

## ⚠️ Anti-Patterns

❌ Jump to solution before understanding the problem  
❌ Write requirements as solutions ("The system will use Redis") instead of needs  
❌ Ignore non-functional requirements  
❌ Skip stakeholder validation on requirements  
❌ Over-engineer: model every edge case before building MVP  
