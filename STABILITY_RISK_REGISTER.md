# STABILITY_RISK_REGISTER.md — Long-term risk tracking

> **Created:** 2026-05-25 (sau stability assessment)
> **Mục đích:** Track 15 rủi ro phát hiện trong stability audit + status mitigation.
> **Review cadence:** Weekly (mỗi Thứ 6) — update column "Status" + add new risks nếu phát hiện.

---

## Risk severity legend

| Level | Định nghĩa | SLA mitigation |
|---|---|---|
| 🔴 **CRITICAL** | Sẽ cause production failure trong 1-3 tháng nếu không xử lý | < 4 tuần |
| 🟠 **HIGH** | Will degrade at scale (10x current load) | < 8 tuần |
| 🟡 **MEDIUM** | Operational pain ongoing | < 12 tuần |
| 🟢 **LOW** | Quality-of-life | Best effort |

---

## 🔴 CRITICAL risks

### C1 — Bleeding-edge stack
- **Components:** Prisma 7.6.0, Next.js 16.2.2, Express 5.2.1, Tailwind 4, React 19.2.4, Zod 4.3.6, embedded-postgres 18.3.0-**beta**.16
- **Evidence:** `frontend/AGENTS.md` cảnh báo "This is NOT the Next.js you know"
- **Impact:** Stack Overflow/AI training data sai 6-12 tháng nữa; upgrade breaking thường xuyên; community workaround chưa có
- **Mitigation:** Sprint S4 — Pin versions exact, document upgrade strategy, quarterly review
- **Status:** 🟠 **PARTIAL** 2026-05-26 00:30 (S4-2 versions pinned exact, S4-4 UPGRADE_STRATEGY.md shipped; S4-1 BETA replacement còn chờ Hưng manual migration)
- **Owner:** cpvt-be + cpvt-fe

### C2 — Zero test coverage
- **Evidence:** `find -name "*.test.*"` = 0 results
- **Impact:** Bất kỳ refactor (UI redesign, security fixes) = regression không catch được
- **Mitigation:** Sprint S1 — Vitest + Supertest 15 smoke tests cho golden paths
- **Status:** 🔴 OPEN (Sprint S1-2)
- **Owner:** cpvt-be

### C3 — JWT trong localStorage (XSS sink)
- **Evidence:** `localStorage.getItem('ibshi_token')` trải khắp frontend; DEVOPS_NOTES §8 acknowledged
- **Impact:** XSS nhỏ → token bị steal → impersonation toàn app
- **Mitigation:** Sprint S2 — Migrate sang HttpOnly cookie + CSRF token
- **Status:** 🔴 OPEN (Sprint S2-1)
- **Owner:** cpvt-be + cpvt-fe

### C4 — No structured logging
- **Evidence:** 19 `console.log/console.error` trải rác `src/controllers/`
- **Impact:** Debug production = SSH + grep terminal; log mất khi terminal đóng; không trace correlation IDs
- **Mitigation:** Sprint S1 — Pino logger + log rotation launchd
- **Status:** ✅ **CLOSED** 2026-05-25 23:50 (Pino + correlationId + redact deployed; 19 → 0 console calls)
- **Owner:** cpvt-be

### C5 — embedded-postgres BETA + manual postmaster.pid
- **Evidence:** DEVOPS_NOTES §2.2; user phải `rm -f pg_data/postmaster.pid` mỗi lần start
- **Impact:** User restart máy → quên restart PG → app degraded silently
- **Mitigation:** Sprint S4 — Replace embedded-postgres → official `postgres:18` Docker image
- **Status:** 🔴 OPEN (Sprint S4-1)
- **Owner:** cpvt-devops

---

## 🟠 HIGH risks

### H6 — 3-terminal-tab orchestration manual
- **Evidence:** DEVOPS_NOTES §1: "PHẢI 3 tab riêng, KHÔNG nohup"
- **Impact:** User restart máy = quên 1 service = app down
- **Mitigation:** Sprint S3 — docker-compose.dev.yml + PM2/launchd process manager
- **Status:** ✅ **CLOSED** 2026-05-26 00:30 (docker-compose.dev.yml + ecosystem.config.js PM2 shipped)

### H7 — 1 backup duy nhất từ 3 ngày trước
- **Evidence:** `ls pg_data/*.sql` = 1 file 1.5MB từ 2026-05-23
- **Impact:** Crash giữa session → mất data 3 ngày work
- **Mitigation:** Sprint S3 — Daily automated pg_dump + 30-day retention + remote copy
- **Status:** ✅ **CLOSED** 2026-05-26 00:30 (backup_pg.sh + launchd plist daily 02:00 + 30-day retention; REMOTE_BACKUP_DIR optional for NAS)

### H8 — DB pool leak ở /health endpoint
- **Evidence:** app.js:165 `new Pool()` mỗi request, không cache
- **Impact:** Health check rate >1/sec → connection exhaust
- **Mitigation:** Sprint S2 — Singleton Pool
- **Status:** ✅ **CLOSED** 2026-05-25 23:50 (singleton healthPool max=5 idle=30s)

### H9 — No request validation (Zod installed unused)
- **Evidence:** `grep '.parse()' src/controllers/` = 0 results
- **Impact:** Malformed payload → 500 thay vì 400
- **Mitigation:** Sprint S2 — Zod middleware apply 38 endpoints
- **Status:** 🟠 **PARTIAL** 2026-05-26 00:30 (framework `validate.js` + 3 auth endpoints applied; 35 endpoints remaining cần áp dần per sprint)

### H10 — No CSRF protection
- **Evidence:** Helmet không add CSRF, CORS `credentials: true`
- **Impact:** Logged-in user vào malicious site → state-changing POST có thể work
- **Mitigation:** Sprint S2 — Implement CSRF token cùng với HttpOnly cookie migration
- **Status:** 🟠 OPEN (Sprint S2-1 combined)

---

## 🟡 MEDIUM risks

### M11 — Missing FK indexes
- **Fields:** ContractDetail.purchaseOrderId, BidAnalysis.prId, BidAnalysis.prDetailId
- **Impact:** JOIN performance degrade 10x ở 10K+ records
- **Mitigation:** Sprint S3-4 — Add 3 indexes via migration
- **Status:** 🟠 **SCHEMA UPDATED** 2026-05-26 00:30 (schema.prisma + migration SQL ready; Hưng apply via `psql -1 -f prisma/migrations/20260525_s34_add_fk_indexes.sql`)

### M12 — Manual migration không có Prisma migrate table
- **Evidence:** CLAUDE.md Rule #6: `migrate diff > psql -f`
- **Impact:** Không rollback được, không biết DB schema version nào
- **Mitigation:** Sprint S3-5 — Convert sang migrations folder + document
- **Status:** 🟡 OPEN

### M13 — uploads/ không giới hạn growth
- **Evidence:** bid-analyses/ avg 2.6MB/file; 1000 files = 2.6GB
- **Impact:** Disk fill → upload fail
- **Mitigation:** Sprint S3-3 — Archive files >6 tháng + disk quota alert
- **Status:** ✅ **CLOSED** 2026-05-26 00:30 (uploads_archive.sh + launchd monthly + 5GB quota osascript notify)

### M14 — OCRP NDJSON backup unlimited
- **Evidence:** `.bak.YYYYMMDD_HHMMSS_pre_*` mỗi run
- **Impact:** Disk fill OCR side
- **Mitigation:** Coordinate OCRP — retention 30 days
- **Status:** 🟡 OPEN (OCRP-owned)

### M15 — No dev/staging/prod isolation
- **Evidence:** 1 DATABASE_URL duy nhất
- **Impact:** Test in production
- **Mitigation:** Phase D — Setup staging env (requires deploy infrastructure first)
- **Status:** 🟡 DEFERRED Phase D

---

## Status summary (updated 2026-05-26 00:30)

| Status | Count | Risks |
|---|---:|---|
| ✅ CLOSED | 5 | C4, H6, H7, H8, M13 |
| 🟠 PARTIAL / SCHEMA-READY | 3 | C1 (versions pinned, BETA pending), H9 (4/38 endpoints), M11 (migration ready) |
| 🔴 CRITICAL OPEN | 3 | C2 (tests), C3 (JWT localStorage), C5 (embedded BETA — depends on Hưng manual) |
| 🟠 HIGH OPEN | 1 | H10 (CSRF — bundled với S2-1 cookie) |
| 🟡 MEDIUM OPEN | 3 | M12 (Prisma migrate folder), M14 (OCRP backup unlimited), M15 (no staging env) |
| **TOTAL** | **15** | (5 closed = 33% in 1 day) |

---

## Review history

| Date | Action | By |
|---|---|---|
| 2026-05-25 20:00 | Initial assessment + 15 risks identified | CPVT session |
| 2026-05-25 23:50 | Phase A batch 1: C4 + H8 CLOSED, C2 partial (smoke test) | CPVT session |
| 2026-05-26 00:30 | Phase A+B batch 2: H6 + H7 + M13 CLOSED, C1 + H9 + M11 PARTIAL | CPVT session |
| (next Friday) | Weekly review | Friday cadence |

---

## Linked artifacts

- [PLATFORM_COMPLETION_PLAN.md](PLATFORM_COMPLETION_PLAN.md) — 4 phases A-D mapping
- [BACKLOG.md](BACKLOG.md) — task entries S1-1 → S4-5
- [DEVOPS_NOTES.md](DEVOPS_NOTES.md) — §8 pending issues (overlap với risk này)
