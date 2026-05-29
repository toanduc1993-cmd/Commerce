# LONG_TERM_ROADMAP.md — Roadmap tránh fix nhỏ lặp lại

> **Mục đích:** Đầu tư hạ tầng (tests, types, validation, docs sync) để **gỡ tận gốc** thay vì vá lẻ.
> **Driver:** 22 small fixes trong 2 ngày (2026-05-23 → 2026-05-25) → analysis trong [CHANGES_LOG.md](CHANGES_LOG.md). Pattern lặp 8 nhóm A-H.
> **Cross-ref:** [CLAUDE.md](CLAUDE.md) hard rules. [DEVOPS_NOTES.md](DEVOPS_NOTES.md) gotchas.

---

## 📊 8 Nhóm pattern + root cause

| Nhóm | Symptom | Root cause | Fix gốc |
|---|---|---|---|
| A | Hardcoded URLs | Không centralized API client | Phase 1 — refactor api.ts là CHỖ DUY NHẤT có URL |
| B | Bug enum typo | Status là string tự do, không TS const | Phase 1 — TS enums shared FE/BE |
| C | Misleading copy | Không content catalog, không review process | Phase 2 — i18n + content registry |
| D | Missing routes | Controllers tách rời routes, dễ quên register | Phase 1 — Script `audit-routes.sh` so sánh exports vs router |
| E | Mock data residue | Không flag dev/prod data | Phase 1 — `process.env.NEXT_PUBLIC_USE_MOCK` cố định |
| F | Schema gaps | Schema cứng day-1, ko account import + workflow | Phase 2 — Schema review checklist + Prisma seed fixtures |
| G | Infra fragile | Nhiều moving parts, deps conflict | Phase 1 — `docker compose -f dev.yml up` 1 command |
| H | Docs drift | Docs nói A, code làm B | Phase 2 — ADR + CI lint docs <-> code |

---

## 🎯 PHASE 0 — Quick wins (1 tuần, ~10h)

Mục tiêu: **bịt 5 lỗ hở** lớn nhất, ngăn pattern A/D/G lặp lại.

| # | Task | Effort | Pattern fix | Owner |
|---|---|---:|---|---|
| 0.1 | Audit toàn bộ frontend cho hardcoded `http://localhost:5005` → refactor sang `apiClient` | 2h | A | Claude |
| 0.2 | Script `scripts/audit-routes.sh` — diff `controllers/*.js exports` vs `routes/*.js router.METHOD` → list orphan | 1h | D | Claude |
| 0.3 | Script `scripts/audit-todos.sh` — grep `TODO\|FIXME\|HACK` toàn project, fail nếu unfixed >30 ngày | 30' | H | Claude |
| 0.4 | Status enum file shared: `shared/enums.ts` — PR/PO/BID statuses; import cả FE+BE | 2h | B | Claude |
| 0.5 | `dev.docker-compose.yml` — 3 services + volume mount source → 1 command bring up all (thay 3 terminal) | 3h | G | Claude (cần test) |
| 0.6 | UI string registry `frontend/src/i18n/vi.ts` — extract top-20 misleading-prone strings (login, errors, hints) | 1.5h | C | Claude |

**Output mong đợi:** 0 hardcoded URLs / 0 orphan routes / 0 stale TODOs / DB enums type-safe.

---

## 🏗️ PHASE 1 — Foundation (1 tháng, ~40h)

Mục tiêu: **test + lint + CI** chạy được, mọi PR phải pass.

| # | Task | Effort | Lợi ích |
|---|---|---:|---|
| 1.1 | **Vitest + Supertest** — 15 smoke tests critical paths (auth, bid upload, PO generate, peg, approval workflow) | 8h | Catch regression khi refactor |
| 1.2 | **ESLint rules custom** — no-hardcoded-url, no-mock-import-in-page, require-jsdoc-on-controller | 4h | Block bug từ PR |
| 1.3 | **Zod validation middleware** — schema cho mọi POST/PATCH body | 6h | Loại bug input invalid |
| 1.4 | **Prisma generate hook** — git pre-commit chạy `prisma generate` nếu schema.prisma đổi | 1h | Tránh stale Prisma client |
| 1.5 | **GitHub Actions CI** — install + lint + test + build trên mỗi PR | 4h | Quality gate |
| 1.6 | **Pino structured logging** backend — thay console.log | 3h | Debug prod dễ hơn |
| 1.7 | **API contract types shared** — generate FE types từ BE Zod schemas (zod-to-ts) | 6h | FE/BE đồng bộ tự động |
| 1.8 | **Database seed fixtures** — `prisma/seed.dev.ts` deterministic data cho tests | 4h | Test stable, reproducible |
| 1.9 | **Audit log retention** cron — xóa AuditLog > 90 ngày | 1h | DB không phình |
| 1.10 | **HttpOnly cookie cho JWT** + CSRF token | 4h | Fix XSS risk hiện tại |

**Output mong đợi:** Test coverage 30%+ critical paths. CI block PR có bug.

---

## 🔐 PHASE 2 — Hardening (2-3 tháng, ~80h)

Mục tiêu: **production-grade observability + sustainability**.

| # | Task | Effort | Lợi ích |
|---|---|---:|---|
| 2.1 | **Phase 4 OCR chứng chỉ MTR/CO/CQ** (Gemini Vision) | 16h | Đóng promise HANDOVER |
| 2.2 | **i18n catalog** `vi.json` + react-intl, extract toàn bộ UI strings | 12h | Content review process |
| 2.3 | **Storybook** UI components — document mọi state | 16h | Catch missing-feature dev |
| 2.4 | **Sentry frontend** + **OpenTelemetry backend** — error tracking + APM | 8h | Detect prod incidents |
| 2.5 | **OpenAPI/Swagger** auto-generate từ Zod | 6h | Docs sync code |
| 2.6 | **ADR (Architecture Decision Records)** — `docs/adr/NNNN-decision.md` | 4h | Track major decisions |
| 2.7 | **Per-PR preview environment** (Vercel/Fly) | 8h | User test trước merge |
| 2.8 | **E2E Playwright tests** — 5 user journeys core | 10h | Catch UI regression |

---

## ♻️ PHASE 3 — Sustainability (4-6 tháng, ~100h)

Mục tiêu: **scale team + product maturity**.

| # | Task | Effort |
|---|---|---:|
| 3.1 | Multi-language (EN added cho stakeholders nước ngoài) | 20h |
| 3.2 | Role-based UI (admin sees more) — current chỉ backend check | 12h |
| 3.3 | Notification system (email + in-app) cho approval flow | 16h |
| 3.4 | Audit dashboard — visualize approval bottlenecks | 12h |
| 3.5 | Mobile-responsive cho phòng warehouse (tablet QC) | 16h |
| 3.6 | Documentation site (Docusaurus) — sync với code via CI | 12h |
| 3.7 | Security pen-test + remediation | 12h |

---

## 🎯 KPIs theo dõi (review mỗi cuối tháng)

| Metric | Baseline (2026-05-25) | Target Phase 1 | Target Phase 2 |
|---|---:|---:|---:|
| Hardcoded URLs trong FE | ~5+ (chưa audit hết) | 0 | 0 |
| Orphan routes (controller có, route missing) | 1+ (chưa audit hết) | 0 | 0 |
| Test coverage (critical paths) | 0% | 30% | 60% |
| Stale TODOs > 30 ngày | 0 (vừa fix #1) | 0 | 0 |
| Time setup dev mới (từ git clone đến hello) | ~30 phút thủ công | 5 phút (docker compose) | 2 phút |
| Số fix < 1 ngày trong sprint | 22/2 ngày | <5/tuần | <2/tuần |

---

## 📋 Execution principles

1. **NO BAND-AID** — nếu fix nhỏ giải vào nhóm A-H, em PHẢI nói "đây là pattern lặp, đề xuất task Phase X" thay vì chỉ fix lẻ
2. **WORK ON ONE PHASE AT A TIME** — không nhảy giữa các phase
3. **TASK > 4H = chia nhỏ** — milestone rõ ràng để rollback nếu sai
4. **EACH TASK COMPLETE = update KPI** + entry CHANGES_LOG.md
5. Khi user yêu cầu sửa, em **propose** nhóm fix gốc (Phase) thay vì hỏi từng item nhỏ

---

## 🚀 Recommend bắt đầu

**Phase 0 task 0.1 + 0.2 + 0.3** (3.5h) → bịt 3 lỗ lớn nhất trong 1 session:
- Refactor hardcoded URLs (catch nhóm A)
- Audit routes orphan (catch nhóm D)
- Audit stale TODOs (catch nhóm H)

Sau đó user review output → quyết định tiếp Phase 0 hay nhảy Phase 1 (tests).

---

## 📅 Lịch sử cập nhật

| Date | Update | Author |
|---|---|---|
| 2026-05-25 | Roadmap đầu tiên — 4 phases, 22 small fixes analysis | Claude |
