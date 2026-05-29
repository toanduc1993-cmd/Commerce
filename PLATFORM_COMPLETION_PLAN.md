# PLATFORM_COMPLETION_PLAN.md — Lộ trình hoàn thiện Platform Vật Tư

> **Driver:** User yêu cầu lên kế hoạch hoàn thiện platform 2026-05-25 17:00
> **REVISED 2026-05-25 20:00:** Sau stability assessment, tái cấu trúc thành **4 PHASES** (A→B→C→D) stability-first thay vì 4 tracks parallel ngay
> **Scope:** Tất cả việc pending từ [BACKLOG.md](BACKLOG.md) + [LONG_TERM_ROADMAP.md](LONG_TERM_ROADMAP.md) + [OCRP BACKLOG](../IBSHI/mua-hang/02.CONG-CU/ibs-ocr/BACKLOG.md) + [STABILITY_RISK_REGISTER.md](STABILITY_RISK_REGISTER.md)
> **Định hướng:** Phase A+B (stability foundation, 76h) → Phase C (UI redesign 64h) → Phase D (ongoing hardening)

---

## 0. PHASES OVERVIEW (NEW STRUCTURE)

| Phase | Focus | Duration | Effort | Why this order |
|---|---|---|---:|---|
| **A — Stability Foundation** | Sprint S1 + S2 + S3 | Tuần 1-4 | 60h | Mitigates 10/15 risks (C1-C4, H6-H10, M11-M13). Pre-req for safe UI refactor |
| **B — Dependency De-risk** | Sprint S4 | Tuần 5 | 16h | Removes embedded-postgres BETA (C5), pins versions (C1) |
| **C — UI Redesign** | Sprint UI-1 → UI-4 | Tuần 6-9 | 64h | Workflow-first nav, design tokens, consolidated BID, project workspace view |
| **D — Long-term Hardening** | Ongoing | Quarterly | TBD | Pen-test, dependency audit, backup restore test, perf baseline |

**Total Phase A+B+C = 140h spread 9 weeks** (vs original 155h spread 4 weeks but unstable).

---

---

## 1. Status hiện tại (snapshot 2026-05-25 17:10)

### ✅ Đã go-live
- **Backend**: 50+ endpoints, JWT auth, 25 Prisma models
- **Frontend**: 13 pages (login + 12 modules)
- **Database**: 52 Projects, 136 Vendors, 4,440 Materials, 2,994 ContractDetails, 96 BidAnalysis, 1,351 PrDetails
- **OCR ingestion**: 4,440 items + 1,416 invoices migrated từ OCRP 2026-05-23
- **Workflow features**: PR upload, BID analysis, **per-item vendor approval** (mới 2026-05-25), file source upload+download

### ⚠️ Issues active
- **Phase 4 OCR chứng chỉ (MTR/CO/CQ)**: zero code (HANDOVER claim đã có, thực tế stub)
- **Zero test coverage** (0 test files)
- **No structured logging** (console.log)
- **JWT trong localStorage** (XSS risk)
- **Input validation ad-hoc** (no Zod)
- **Hardcoded URLs** trong FE (chưa audit hết — 1 file đã fix)
- **Multi-language ko có** (chỉ vi)
- **No CI/CD** (manual deploy)

### 📋 Pending workload
- **CPVT BACKLOG:** 9 entries (5×P1, 4×P2-P4) — Phase 0+1 LONG_TERM_ROADMAP
- **OCRP BACKLOG:** 14 entries (1×P0 blocked-now-unblocked, 4×P1, 3×P2, 4×P3, 2×P4)
- **Cross-session:** OCR→CPVT diff API, qualitySource field, FX historical

---

## 2. Vision — "Platform hoàn thiện" nghĩa là gì?

| Tiêu chí | Đo lường |
|---|---|
| **End-to-end workflow** | PR → BID → Approval → PO → GRN → Inventory → Payment chạy đầy đủ trên UI, không cần Excel ngoài |
| **OCR-driven data influx** | Cứ có file mới trong `00.DATA/` → tự động OCR → ingest → notify users qua UI |
| **Quality assured** | ≥50% test coverage critical paths, CI gate trên PR |
| **Auditable + secure** | Audit log retention, JWT secure, Zod input validation, no XSS |
| **Observable** | Structured logs aggregate, error tracking (Sentry), uptime monitor |
| **Scalable** | Docker deploy 1 command, per-PR preview env, mobile responsive |
| **Self-documenting** | OpenAPI spec auto-gen, ADR records, Storybook UI |

---

## 3. PHASE A — STABILITY FOUNDATION (Tuần 1-4, 60h) 🔥 PRIORITY

### Sprint S1 — Observability + Tests (24h)

| ID | Task | Owner | ETA | Risk addressed |
|---|---|---|---:|---|
| **S1-1** | Pino structured logging + log rotation launchd; replace 19 console.log | cpvt-be | 6h | C4 |
| **S1-2** | Vitest + Supertest — 15 smoke tests golden paths (auth, PR import, BID upload, PO gen, GRN, peg, role) | cpvt-be | 10h | C2 |
| **S1-3** | Health checks enhanced — DB pool stats, disk, /metrics Prometheus | cpvt-be | 4h | H8 |
| **S1-4** | Error boundaries frontend + self-hosted error logger | cpvt-fe | 4h | (new) FE errors invisible hiện tại |

### Sprint S2 — Security Hardening (16h)

| ID | Task | Owner | ETA | Risk addressed |
|---|---|---|---:|---|
| **S2-1** | HttpOnly cookie + CSRF token migration (JWT khỏi localStorage) | cpvt-be+fe | 8h | C3, H10 |
| **S2-2** | Zod validation middleware apply 38 endpoints | cpvt-be | 6h | H9 |
| **S2-3** | /health pool leak fix — singleton Pool | cpvt-be | 1h | H8 |
| **S2-4** | Audit log retention cron (>90 days delete) | cpvt-be | 1h | (DB bloat) |

### Sprint S3 — Ops + Backup (20h)

| ID | Task | Owner | ETA | Risk addressed |
|---|---|---|---:|---|
| **S3-1** | docker-compose.dev.yml (PG + backend + frontend, 1 command) | cpvt-devops | 6h | H6 |
| **S3-2** | Automated daily pg_dump + 30-day retention + remote NAS copy | cpvt-devops | 4h | H7 |
| **S3-3** | uploads/ archival cron + disk quota alert | cpvt-devops | 3h | M13 |
| **S3-4** | Add 3 missing FK indexes via migration | cpvt-db | 1h | M11 |
| **S3-5** | Convert manual migrations → prisma migrate folder + rollback doc | cpvt-db | 4h | M12 |
| **S3-6** | Process manager (PM2/launchd) auto-restart backend on crash | cpvt-devops | 2h | H6 |

**Phase A gating criteria** trước khi vào Phase B:
- ✅ 15 tests pass trên `npm test`
- ✅ `/health/detail` trả về DB pool count + disk free
- ✅ `/var/log/ibshi/*.log` rotation OK (logrotate verified)
- ✅ `pg_dump` cron chạy thành công ≥3 lần
- ✅ `docker-compose up` bring up đủ 3 services trong <60s

---

## 4. PHASE B — DEPENDENCY DE-RISK (Tuần 5, 16h)

| ID | Task | Owner | ETA | Risk addressed |
|---|---|---|---:|---|
| **S4-1** | Replace embedded-postgres BETA → official postgres:18 image | cpvt-devops | 4h | C5 |
| **S4-2** | Pin versions exact (remove `^` from critical deps) | cpvt-be+fe | 2h | C1 |
| **S4-3** | npm audit fix + snyk weekly cron + add to CI | cpvt-devops | 2h | (security baseline) |
| **S4-4** | Document upgrade strategy — quarterly review for Prisma/Next/React | cpvt-be | 2h | C1 mitigation |
| **S4-5** | CI pipeline GitHub Actions — typecheck + lint + tests on PR | cpvt-devops | 6h | (regression prevention) |

**Phase B gating** trước khi vào Phase C:
- ✅ Docker compose use postgres:18 image (no BETA)
- ✅ package-lock.json no `^` for prisma/next/react/express/tailwind
- ✅ CI green trên all PRs

---

## 5. PHASE C — UI REDESIGN (Tuần 6-9, 64h) — Workflow-first UX

> **Trigger:** Chỉ start sau Phase A+B gating pass. Tests + logging + CI sẽ catch regressions.
> **Detail:** xem [STABILITY_RISK_REGISTER.md](STABILITY_RISK_REGISTER.md) §"UI proposal stability impact" + assessment doc.

### Sprint UI-1 — Design system + Foundation (16h)

| ID | Task | Owner | ETA |
|---|---|---|---:|
| **UI-1-1** | Design system tokens — typography scale (6 levels), 5 semantic colors, spacing scale | cpvt-fe | 4h |
| **UI-1-2** | Workflow-first sidebar — 7-bước numbered nav với badge count per step | cpvt-fe | 4h |
| **UI-1-3** | Workspace selector — project context provider, focus 1 DA xuyên app | cpvt-fe | 4h |
| **UI-1-4** | Cmd+K global search palette (cần backend `/api/v1/search` indexed) | cpvt-be+fe | 4h |

### Sprint UI-2 — Workflow visualization (20h)

| ID | Task | Owner | ETA |
|---|---|---|---:|
| **UI-2-1** | Per-PR progress timeline component (7-step micro progress bar) | cpvt-fe | 6h |
| **UI-2-2** | Dashboard "My actions" zone — backend `/api/v1/dashboard/my-actions` | cpvt-be+fe | 6h |
| **UI-2-3** | Consolidate BID 3 pages → 1 page với 3 tabs (preserve old URLs via redirect) | cpvt-fe | 8h |

### Sprint UI-3 — Polish (12h)

| ID | Task | Owner | ETA |
|---|---|---|---:|
| **UI-3-1** | Responsive — sidebar collapse on tablet/mobile | cpvt-fe | 4h |
| **UI-3-2** | Skeleton loading states (replace "Đang tải..." text) | cpvt-fe | 3h |
| **UI-3-3** | Empty states với CTA + onboarding hints | cpvt-fe | 3h |
| **UI-3-4** | Inline edit cho approval/status fields | cpvt-fe | 2h |

### Sprint UI-4 — Power user (16h)

| ID | Task | Owner | ETA |
|---|---|---|---:|
| **UI-4-1** | Project workspace view — 1 page tổng hợp 7 bước cho 1 DA | cpvt-be+fe | 10h |
| **UI-4-2** | Charts upgrade Recharts (replace inline bars) | cpvt-fe | 4h |
| **UI-4-3** | Keyboard shortcuts cheatsheet modal (?) | cpvt-fe | 2h |

**Phase C gating** (UX testing):
- ✅ 5-second test pass: Hưng trả lời đúng "có bao nhiêu việc cần làm hôm nay" trong 5s
- ✅ First-click test ≥80% cho 5 task phổ biến
- ✅ Time-on-task giảm >30% so với baseline

---

## 6. PHASE D — LONG-TERM HARDENING (ongoing)

| Task | Cadence | Owner |
|---|---|---|
| Quarterly dependency audit (Prisma/Next/React/Tailwind versions) | Q1, Q3 | cpvt-be+fe |
| Monthly DB backup test restore (verify backup actually works) | Hàng tháng | cpvt-devops |
| Performance baseline metrics (p50/p95 query time, page load) | Weekly | cpvt-be |
| OpenAPI spec auto-gen + publish | Per release | cpvt-be |
| Penetration test | Năm 1 lần | external |
| Staging env setup | Q3 | cpvt-devops |

---

## 7. OLD 4-Track structure (SUPERSEDED)

> ⚠️ Section dưới đây là **plan cũ** (4 parallel tracks). Đã supersede bởi Phase A→D structure ở trên.
> Giữ lại để reference task IDs Track A/B (đã DONE 1 phần trong Sprint 1 cũ).

### 🛣️ Track A — **OCR Data Pipeline integration** (Cross CPVT ↔ OCRP)
Mục tiêu: Mọi data OCR ingest tự động + verified vào CPVT DB.

| Sprint | Task | Owner | Effort |
|---|---|---|---:|
| 1 | B-OCRP-001 Cross-check sau export v1.1 (UNBLOCKED) | OCRP | 30' |
| 1 | B-CPVT-005 Add BidQuoteOffer.qualitySource | cpvt-db | 1h |
| 1 | B-CPVT-006 Admin endpoint /api/v1/admin/ocr-diff/:entity | cpvt-be | 4h |
| 2 | B-OCRP-002 P4 Platform Adapter (IN_PROGRESS) | ocrp-ada | ~6h |
| 2 | CPVT script `import_from_ocr.py` (consume adapter output) | cpvt-be | 4h |
| 2 | B-OCRP-005 Build OCR BID_QUOTE + PrDetail master | OCRP | 3h |
| 3 | B-OCRP-003 Top 7 PDFs Claude Read scale | ocrp-cr | 7-14h |
| 3 | CPVT merge Claude Read records với qualitySource=CLAUDE_READ | cpvt-be | 2h |
| 4 | B-OCRP-008 Monitor data drift cron | OCRP | 6h |
| 4 | CPVT receive drift notifications + UI alert | cpvt-fe | 3h |

### 🛣️ Track B — **CPVT features completion**
Mục tiêu: Bịt gap UI/workflow theo audit + roadmap.

| Sprint | Task | Owner | Effort |
|---|---|---|---:|
| 1 | B-CPVT-002 Audit + refactor hardcoded URLs (Phase 0.1) | cpvt-fe | 2h |
| 1 | B-CPVT-007 Shared TS enums (Phase 0.4) | cpvt-fe+be | 2h |
| 2 | **Phase 4 OCR chứng chỉ MTR/CO/CQ** — Claude Vision API Vision endpoint | cpvt-be | 16h |
| 2 | Phase 4 Frontend Certificate upload UI | cpvt-fe | 8h |
| 3 | B-CPVT-009 i18n top-20 strings (Phase 0.6) | cpvt-fe | 2h |
| 3 | Dashboard cải tiến: cross-project KPI views | cpvt-fe | 4h |
| 4 | Báo cáo Excel export per workflow stage | cpvt-be | 6h |

### 🛣️ Track C — **Infrastructure & Quality**
Mục tiêu: Test + CI/CD + observability cho production-grade.

| Sprint | Task | Owner | Effort |
|---|---|---|---:|
| 1 | B-CPVT-003 audit-routes.sh (Phase 0.2) | CPVT | 1h |
| 1 | B-CPVT-004 audit-todos.sh (Phase 0.3) | CPVT | 30' |
| 1 | B-CPVT-008 dev.docker-compose.yml (Phase 0.5) | cpvt-dep | 3h |
| 2 | Phase 1.1 Vitest + Supertest 15 smoke tests | cpvt-be | 8h |
| 2 | Phase 1.2 ESLint custom rules | cpvt-fe+be | 4h |
| 3 | Phase 1.3 Zod validation middleware | cpvt-be | 6h |
| 3 | Phase 1.4 Prisma generate pre-commit hook | cpvt-dep | 1h |
| 3 | Phase 1.5 GitHub Actions CI (lint+test+build) | cpvt-dep | 4h |
| 4 | Phase 1.6 Pino structured logging | cpvt-be | 3h |
| 4 | Phase 1.10 HttpOnly cookie + CSRF | cpvt-be+fe | 4h |

### 🛣️ Track D — **Process & Documentation**
Mục tiêu: Sustainable team workflow.

| Sprint | Task | Owner | Effort |
|---|---|---|---:|
| 1 | Update PLATFORM_COMPLETION_PLAN sau mỗi sprint | MGR | 30'/wk |
| 1 | Weekly BACKLOG_AGGREGATE refresh (cron đã set) | MGR | auto |
| 2 | Phase 2.6 ADR (Architecture Decision Records) — 3-5 ADR đầu | DA | 4h |
| 2 | Phase 2.5 OpenAPI auto-gen từ Zod | cpvt-be | 6h |
| 3 | Phase 2.3 Storybook UI components — top 10 | cpvt-fe | 16h |
| 3 | Phase 2.4 Sentry frontend + OTel backend | cpvt-dep | 8h |
| 4 | Phase 2.7 Per-PR preview env (Fly/Vercel) | cpvt-dep | 8h |
| 4 | Phase 2.8 E2E Playwright 5 journeys | cpvt-fe | 10h |

---

## 4. Sprint plan 4 tuần

### Sprint 1 (Week 1: 2026-05-26 → 06-01) — **Quick wins + unblock**
| Goal | Tasks | Effort |
|---|---|---:|
| Unblock OCR sync | B-OCRP-001, B-CPVT-005, B-CPVT-006 | ~5h |
| Audit fixes | B-CPVT-002 + B-CPVT-007 | 4h |
| Dev infra | B-CPVT-003 + B-CPVT-004 + B-CPVT-008 | 4.5h |
| Docs | PLATFORM_COMPLETION_PLAN + weekly review | 1h |
| **Total** | 11 tasks | ~15h |

### Sprint 2 (Week 2: 06-02 → 06-08) — **Phase 4 + Foundation tests**
| Goal | Tasks | Effort |
|---|---|---:|
| Phase 4 OCR chứng chỉ end-to-end | BE + FE | 24h |
| Smoke tests | Vitest 15 tests | 8h |
| ESLint rules | block hardcoded URL etc. | 4h |
| OCRP P4 adapter complete | B-OCRP-002, B-OCRP-005 | 9h |
| **Total** | 8 tasks | ~45h |

### Sprint 3 (Week 3: 06-09 → 06-15) — **Quality + Validation**
| Goal | Tasks | Effort |
|---|---|---:|
| Zod validation + Prisma hook + CI | 1.3 + 1.4 + 1.5 | 11h |
| Claude Read scale + merge | B-OCRP-003 + CPVT merge | 9-16h |
| i18n + Storybook setup | 0.6 + 2.3 | 18h |
| Sentry + OTel | 2.4 | 8h |
| **Total** | 8 tasks | ~50h |

### Sprint 4 (Week 4: 06-16 → 06-22) — **Production-grade + Polish**
| Goal | Tasks | Effort |
|---|---|---:|
| Logging Pino + HttpOnly cookie | 1.6 + 1.10 | 7h |
| Per-PR preview + E2E | 2.7 + 2.8 | 18h |
| Reports + dashboard | Excel export + cross-project | 10h |
| Drift monitoring | B-OCRP-008 + CPVT receive | 9h |
| **Total** | 7 tasks | ~45h |

**Cộng dồn 4 sprints:** ~155 hours (≈ 1 dev full-time 4 tuần hoặc 2 devs 2 tuần)

---

## 5. Dependency graph (key)

```
B-CPVT-001 (v1.1 DONE ✅)
    ↓
B-OCRP-001 cross-check (UNBLOCKED Sprint 1)
    ↓
B-CPVT-005 qualitySource field (Sprint 1)
    ↓
B-CPVT-006 admin /ocr-diff endpoint (Sprint 1)

B-OCRP-002 P4 adapter (IN_PROGRESS)
    ↓
CPVT import_from_ocr.py (Sprint 2)
    ↓
B-OCRP-003 Claude Read scale + CPVT merge (Sprint 3)

Phase 0.x audits (Sprint 1) → Phase 1.x tests (Sprint 2-3) → Phase 2.x ops (Sprint 3-4)
```

**Critical path:**
1. Track A Sprint 1 unblock OCR sync — **MUST hoàn tất Sprint 1**
2. Phase 4 OCR (Track B Sprint 2) — biggest feature gap, full sprint
3. Tests trước CI/CD (Track C Sprint 2 → Sprint 3)

---

## 6. Risk + Mitigation

| Risk | Severity | Mitigation |
|---|---|---|
| Phase 4 OCR phụ thuộc Claude Vision API API key (chưa có) | 🔴 High | Apply demo API key, hoặc dùng Claude Vision tier có sẵn của OCRP |
| Test coverage write tốn time (8h smoke tests) | 🟡 Med | Bắt đầu với 5 critical paths (login, PR upload, PO gen, peg, approval) |
| Frontend tailwind workaround fragile | 🟡 Med | Đã có symlink, watch khi Next 17 ra |
| Migration data inconsistency (DA bug v1) | 🟢 Low | Schema_version + checksum + rollback v1.0 → đã có process |
| OCRP local OCR crash incident lặp lại | 🟡 Med | Đã có lesson "no parallel bulk", checkpoint INCIDENT |
| User chỉ 1 dev | 🟡 Med | Sub-sessions parallel khi cần (cpvt-fe + cpvt-be độc lập) |

---

## 7. KPIs theo dõi (weekly review)

| KPI | Baseline (now) | Sprint 1 end | Sprint 4 end |
|---|---:|---:|---:|
| BACKLOG total | 23 | <20 | <10 |
| Test coverage (critical paths) | 0% | 0% | 60% |
| Hardcoded URLs FE | 5+ | 0 | 0 |
| Orphan routes | 1+ | 0 | 0 |
| Phase 4 OCR % code | 5% (stub) | 10% | 100% |
| Time setup dev mới | ~30 min | 5 min (compose) | 2 min |
| Sessions với BACKLOG.md | 2/3 (DA chưa) | 3/3 | 3/3 |
| Active sub-sessions T2 | 1 (cpvt-be) | 2 (+cpvt-fe) | 3+ |
| Process incidents | 0 | 0 | 0 |

---

## 8. Communication cadence

| Cadence | Activity | Owner |
|---|---|---|
| **Daily** (em chủ động) | Update STATE.md, check inboxes, log CHANGES_LOG | each session |
| **Per task DONE** | Move BACKLOG → CHANGES_LOG, update aggregate, notify cross-session | task owner |
| **Per sprint end** | Update PLATFORM_COMPLETION_PLAN status, KPI review | MGR |
| **Weekly Chủ nhật 02:00** | Auto-compact logs (launchd) | system |
| **Per Hưng request** | Re-plan/spawn sub-session if needed | MGR |

---

## 9. Decisions — Hưng đã quyết (2026-05-25 17:20)

| # | Decision | Chosen |
|---|---|---|
| 1 | OCR Vision API | **Claude API** (đã work tốt trong OCRP Sprint P3, KHÔNG dùng Claude Vision API) |
| 2 | FX historical | **Hardcode 25000** (MVP đủ, P3 sau migrate NHNN) |
| 3 | Test coverage target | **60% critical paths** |
| 4 | Deployment target | **LAN nginx** (đã có config) |
| 5 | Sub-sessions | **Tag-only** (current pattern) |

→ Sprint 1 chạy NGAY (không chờ ngày mai).

---

## 10. Lịch sử cập nhật

| Date | Update | Author |
|---|---|---|
| 2026-05-25 17:10 | Initial — 4 tracks, 4 sprints, 23 BACKLOG + audit gaps | CPVT |
