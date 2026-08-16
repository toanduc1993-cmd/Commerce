# BACKLOG.md — CPVT (Code Platform Vật Tư)

> Pending/upcoming work. Khác [CHANGES_LOG.md](CHANGES_LOG.md) (completed audit).
> Source: LONG_TERM_ROADMAP Phase 0-3 + ad-hoc from sessions.

---

## 🔴 MỚI 2026-08-14 — phát hiện khi nghiệm thu giao diện

> Kiểm bằng đĩa + truy vấn cơ sở dữ liệu thật, không chép từ tài liệu. Chi tiết: `docs/BAN-DO-NEN-VAT-TU-20260814.html`.

### [P0] Chưa từng có bản sao lưu cơ sở dữ liệu nào
- **ID:** B-CPVT-020 · **Anh Hưng 14/08: ghi nhận, quay lại sau**
- `scripts/backup_pg.sh` chạy được nhưng không có lịch trong launchd lẫn cron; thư mục `backups/` chưa từng tồn tại.
- Đang phơi: 2.994 ContractDetail · 4.440 Material · 1.559 BidQuoteOffer · 2.188 BidQuoteItem trên một ổ đĩa duy nhất.
- **Việc cần làm:** viết plist launchd chạy 02:00 hằng ngày, chạy tay một lần để xác nhận, kiểm tra khôi phục thử.

### [P0] VAT — cột `vatRate` đang chứa hai đơn vị khác nhau, dữ liệu hỏng diện rộng
- **ID:** B-CPVT-021
- 1.619 dòng ghi `10` (phần trăm) nhưng ~900 dòng ghi `0.1` và các biến thể nhiễu dấu phẩy động (`0.10000000000000013`…). Cùng một cột, hai thang đo.
- Rác thật sự: `109900.9`, `233.3`, `49`, `27.3`, `-92`, `-37.2`, `-9.1`.
- 1.120/1.619 dòng `vatRate=10` không khớp công thức `totalWithVAT = totalNoVAT × (1 + vatRate/100)`.
- 252 dòng khai VAT 10% nhưng `totalWithVAT = totalNoVAT` (không hề cộng).
- `bidAnalysisController.js:1716` cứng hoá `total * 1.1`, bỏ qua hoàn toàn cột `vatRate`.
- `BidQuoteOffer` **không có trường VAT nào** ⇒ không thể biết NCC báo giá đã gồm thuế hay chưa.
- **Việc cần làm:** (a) chuẩn hoá thang đo cột `vatRate`; (b) thêm `vatIncluded`/`vatRate` vào `BidQuoteOffer`; (c) thay `* 1.1` bằng tính theo trường thật; (d) cảnh báo khi các NCC trong cùng gói khai VAT khác nhau.

### [P1] Đơn vị tính — không ai kiểm, 58% để trống
- **ID:** B-CPVT-022
- `BidQuoteItem.uom` rỗng ở 1.265/2.188 dòng. Chuỗi chưa chuẩn hoá: `Cái`/`CÁI`/`cái`, `M`/`m`, `PSC` (nhiều khả năng gõ nhầm `PCS`).
- 131 cặp cùng mã vật tư nhưng đơn vị ở PR khác đơn vị ở báo giá.
- `BidQuoteOffer` không có trường đơn vị ⇒ NCC báo theo cây trong khi NCC khác báo theo ký thì hệ thống không ghi nhận, không cảnh báo, vẫn xếp hạng rẻ nhất như thường.
- **Việc cần làm:** chuẩn hoá bảng đơn vị, thêm đơn vị vào báo giá, chặn so sánh khi lệch đơn vị.

### [P1] Nửa cuối quy trình có mã nhưng không có màn hình
- **ID:** B-CPVT-023
- Backend đủ: `receiveMaterial` tạo GRN + GRNLineItem + cập nhật Inventory; `allocateStock` tạo HardPegging; `confirmQC` xác nhận chất lượng. Hàm gọi trong `lib/api.ts` cũng đủ.
- Nhưng **không màn hình nào gọi chúng**: `receiveGoods` · `confirmQC` · `pegStock` · `generatePO` đều là hàm chết.
- Trang `/warehouse` chạy trên nhánh `arrivals` (đọc ContractDetail + ghi InspectionRecord) — một nhánh song song, không nối với GRN.
- **Cần anh Hưng quyết:** nối GRN vào `/warehouse`, hay bỏ nhánh GRN và mở rộng `arrivals`? Hai đường không thể cùng tồn tại.

### [P2] Menu có lối vào hỏng
- **ID:** B-CPVT-024
- `/support` nằm trong thanh điều hướng nhưng **không có trang** ⇒ bấm vào là 404.
- `/alerts` có trang nhưng **không có trong menu** ⇒ không ai vào được nếu không gõ tay địa chỉ.
- Thanh điều hướng đánh số bước 1·1·1·2·3·6·7·8 — **thiếu hẳn bước 4 và 5**, người dùng không hiểu quy trình đứt ở đâu.

### [P2] 11 hàm API viết xong không ai gọi
- **ID:** B-CPVT-025
- `resetCsrfToken` · `importPRFile` · `updateStatusFlag` · `receiveGoods` · `confirmQC` · `pegStock` · `generatePO` · `fetchInventory` · `fetchGroupSelections` · `updateInspectionRecord` · `fetchTechThread`.
- Đúng dạng lỗi R-17: mã chưa từng chạy qua đường thật thì coi như chưa tồn tại.

---

## ✅ DONE — Sprint M4: Scale tạo RFQ + Import Excel (Hưng approve 2026-05-27, ship 2026-05-27)

Đã ship 4/4 task A+B+D+E. Detail entry: [CHANGES_LOG.md § 2026-05-27 12:00](CHANGES_LOG.md).

**Verify e2e (post-build):**
- ✅ BE 3 endpoints HTTP 401 (route mount) → 201/200 với JWT (tạo 3 BID 3 mat groups; cleanup OK)
- ✅ FE compile HTTP 200 cho `/yeu-cau-bao-gia`
- ⏳ User manual UI test còn lại (toggle/dropdown/shift+click/import wizard)

**Còn open (post-M4 ideas, không gấp):**
- Preview rows trước khi commit import (hiện chỉ show summary sau khi đã tạo) — nếu user yêu cầu
- Validation tốt hơn cho file Excel custom (user xoá nhầm cột prDetailId) — hiện validate basic length

---

## 📨 Đang chờ OCRP phản hồi — Data pipeline coordination

> Đã gửi `_sessions/_inbox/ocrp/20260527_185500_cpvt_data-gap-platform-needs-ocr.md` báo data gap (1100+ PDF MS NGẦN chưa OCR). Chờ OCRP báo lại capacity + format NDJSON output + timeline để plan Sprint M5+.
> CPVT side: tự xử lý phần Excel parse được (đã import 333 items từ 10 TH-MUA SẮM CÁC GÓI 2026-05-27 18:45). Không phải blocker; chờ OCRP confirm sequence.

---

## 🔥 P0 — Critical (do now) — STABILITY PHASE A

> **REVISED 2026-05-25 20:00:** Stability-first phase per [STABILITY_RISK_REGISTER.md](STABILITY_RISK_REGISTER.md).
> Phase A+B = 76h trước UI redesign. Detail: [PLATFORM_COMPLETION_PLAN.md](PLATFORM_COMPLETION_PLAN.md).

### Sprint S1 — Observability + Tests (24h)

#### ✅ DONE S1-1 Pino structured logging
- **Status:** ✅ DONE — kiểm bằng đĩa 2026-08-14: `backend/src/lib/logger.js` + `src/middleware/correlationId.js` đã có
- **Risk:** C4 — debug production blind
- **Estimate:** 6h
- **Description:** Replace 19 console.log/error → Pino logger với correlationId per request. Logrotate launchd weekly. Levels: trace/debug/info/warn/error.
- **Files:** NEW `src/lib/logger.js`, NEW `src/middleware/correlationId.js`; UPDATE all controllers + `app.js` error handler

#### ✅ DONE S1-2 Vitest + Supertest 15 smoke tests
- **Status:** ✅ DONE — kiểm bằng đĩa 2026-08-14: `backend/vitest.config.mjs` + `tests/` đã có · npm test 20/20 xanh
- **Risk:** C2 — zero test coverage
- **Estimate:** 10h
- **Description:** Tests cho golden paths: login, change-password, role auth (5 endpoints), PR import, BID upload, PO gen, GRN receive, peg, payment update, vendor enrich (consumer)
- **Files:** NEW `tests/` dir, `vitest.config.ts`, `package.json` add test script

#### ✅ DONE S1-3 Health checks enhanced + /metrics
- **Status:** ✅ DONE — kiểm bằng đĩa 2026-08-14: `/health/detail` và `/metrics` đã mount trong `app.js`
- **Risk:** H8 + early warning
- **Estimate:** 4h
- **Description:** `/health/detail` trả DB pool count + disk free + uptime + memory; `/metrics` Prometheus format cho future scrape
- **Files:** UPDATE `app.js`; NEW `src/middleware/metrics.js`

#### ✅ DONE S1-4 Frontend error boundaries + self-hosted logger
- **Status:** ✅ DONE — kiểm bằng đĩa 2026-08-14: `components/ErrorBoundary.tsx` + `clientErrorsController.js` đã có
- **Estimate:** 4h
- **Description:** React ErrorBoundary wrap mỗi page; POST errors vào backend `/api/v1/client-errors` → write file `errors/client_YYYYMMDD.jsonl`
- **Files:** NEW `frontend/src/components/ErrorBoundary.tsx`; NEW backend `clientErrorsController.js`

### Sprint S2 — Security Hardening (16h)

#### 🟡 XONG MỘT NỬA S2-1 HttpOnly cookie + CSRF migration
- **Status:** 🟡 XONG MỘT NỬA — kiểm bằng đĩa 2026-08-14: Lớp CSRF đã xong (`csrfProtection.js`) — **nhưng JWT vẫn nằm ở `localStorage`**, chưa chuyển sang cookie HttpOnly
- **Risk:** C3, H10
- **Estimate:** 8h
- **Description:** JWT từ localStorage → HttpOnly Secure cookie + csrf-csrf middleware. Frontend api.ts dùng `credentials: 'include'`. Add CSRF header.
- **Files:** UPDATE `authController.js`, `authMiddleware.js`, `app.js`; ALL `frontend/src/lib/api.ts` calls

#### ✅ DONE S2-2 Zod validation middleware
- **Status:** ✅ DONE — kiểm bằng đĩa 2026-08-14: `src/lib/schemas/` + `src/middleware/validate.js` đã có
- **Risk:** H9
- **Estimate:** 6h
- **Description:** Define Zod schemas per route; middleware `validate(schema)` apply 38 endpoints. Convert 500 errors → 400 with field-level messages.
- **Files:** NEW `src/lib/schemas/*.js`, `src/middleware/validate.js`; UPDATE all route files

#### ✅ DONE S2-3 Health pool leak fix
- **Status:** ✅ DONE — kiểm bằng đĩa 2026-08-14: `healthPool` là singleton khai báo đầu `app.js:35`, không còn `new Pool()` mỗi request
- **Risk:** H8
- **Estimate:** 1h
- **Description:** `app.js:165` create singleton pool top-of-file, reuse in `/health`. No more `new Pool()` per request.
- **Files:** UPDATE `app.js`

#### 🟡 XONG MỘT NỬA S2-4 Audit log retention cron
- **Status:** 🟡 XONG MỘT NỬA — kiểm bằng đĩa 2026-08-14: `scripts/audit_log_cleanup.sh` đã viết — **nhưng chưa có lịch chạy** trong launchd/cron
- **Estimate:** 1h
- **Description:** `scripts/audit_log_cleanup.sh` delete AuditLog WHERE createdAt < NOW() - 90 days. Schedule launchd weekly.
- **Files:** NEW `scripts/audit_log_cleanup.sh` + launchd plist

### Sprint S3 — Ops + Backup (20h)

#### ✅ DONE S3-1 docker-compose.dev.yml
- **Status:** ✅ DONE — kiểm bằng đĩa 2026-08-14: `docker-compose.dev.yml` đã có ở gốc dự án
- **Risk:** H6
- **Estimate:** 6h
- **Description:** 1 command bring up postgres:18 + backend + frontend with hot-reload. Volumes for pg_data persist, uploads/ persist.
- **Files:** NEW `docker-compose.dev.yml`, `Dockerfile.backend`, `Dockerfile.frontend`

#### 🟡 XONG MỘT NỬA S3-2 Automated daily pg_dump + retention
- **Status:** 🟡 XONG MỘT NỬA — kiểm bằng đĩa 2026-08-14: `scripts/backup_pg.sh` đã viết — **nhưng chưa có lịch chạy, và thư mục `backups/` chưa từng tồn tại**
- **Risk:** H7
- **Estimate:** 4h
- **Description:** Daily 02:00 launchd → pg_dump → `backups/YYYYMMDD_HHMM.sql.gz`. Retention 30 days local + sync 7 days to NAS via rsync.
- **Files:** NEW `scripts/backup_pg.sh` + launchd plist

#### 🟡 XONG MỘT NỬA S3-3 uploads/ archival + disk quota
- **Status:** 🟡 XONG MỘT NỬA — kiểm bằng đĩa 2026-08-14: `scripts/uploads_archive.sh` đã viết — **nhưng chưa có lịch chạy**
- **Risk:** M13
- **Estimate:** 3h
- **Description:** Cron monthly → files >6 months from uploads/ → archive/. Disk quota alert if uploads/ > 5GB (send notify).
- **Files:** NEW `scripts/uploads_archive.sh` + launchd plist

#### ✅ DONE S3-4 Add 3 missing FK indexes
- **Status:** ✅ DONE — kiểm bằng đĩa 2026-08-14: `@@index([purchaseOrderId])` + `@@index([prId])` + `@@index([prDetailId])` đã có trong schema
- **Risk:** M11
- **Estimate:** 1h
- **Description:** Add `@@index([purchaseOrderId])` to ContractDetail, `@@index([prId])` + `@@index([prDetailId])` to BidAnalysis. Apply via `prisma migrate diff > psql`.
- **Files:** UPDATE `prisma/schema.prisma`; new migration file

#### S3-5 Convert to prisma migrate folder
- **Risk:** M12
- **Estimate:** 4h
- **Description:** `prisma migrate resolve --applied <baseline>` mark current state; future schema changes via `migrate dev --create-only` then manual apply per Rule #6. Document procedure in DEVOPS_NOTES.
- **Files:** NEW `prisma/migrations/` initial baseline; UPDATE DEVOPS_NOTES.md

#### ✅ DONE S3-6 PM2 process manager
- **Status:** ✅ DONE — kiểm bằng đĩa 2026-08-14: `ecosystem.config.js` đã có ở gốc dự án
- **Risk:** H6
- **Estimate:** 2h
- **Description:** PM2 ecosystem.config.js cho backend; auto-restart on crash; log file rotation. Document alternative: launchd plist for production.
- **Files:** NEW `ecosystem.config.js`; UPDATE DEVOPS_NOTES.md

---

## 🟠 P1 — Sprint S4 (DEPENDENCY DE-RISK, 16h)

#### S4-1 Replace embedded-postgres BETA
- **Risk:** C5
- **Estimate:** 4h
- **Description:** docker-compose use `postgres:18-alpine` official. Migrate pg_data từ embedded → docker volume via `pg_dumpall | psql`. Update DEVOPS_NOTES start procedure.
- **Depends on:** S3-1 (docker-compose ready)

#### S4-2 Pin versions exact
- **Risk:** C1
- **Estimate:** 2h
- **Description:** Remove `^` from `prisma`, `next`, `react`, `react-dom`, `express`, `tailwindcss`, `@prisma/client`. Lockfile sacred — commit + verify CI uses `npm ci` not `npm install`.
- **Files:** UPDATE `backend/package.json`, `frontend/package.json`, both `package-lock.json`

#### S4-3 npm audit + snyk weekly
- **Estimate:** 2h
- **Description:** `npm audit fix` baseline; add GitHub Action `snyk/actions` weekly schedule. Alert via email if HIGH/CRITICAL.

#### S4-4 Document upgrade strategy
- **Risk:** C1
- **Estimate:** 2h
- **Description:** NEW `UPGRADE_STRATEGY.md` — quarterly review schedule; pin until stable ecosystem (e.g., Next 17 GA before upgrade Next 16); test matrix per upgrade.

#### ✅ DONE S4-5 CI pipeline GitHub Actions
- **Status:** ✅ DONE — kiểm bằng đĩa 2026-08-14: .github/workflows/ đã có tệp CI
- **Estimate:** 6h
- **Description:** `.github/workflows/ci.yml` — typecheck + lint + tests on PR + main. Required status check for merge. Cache node_modules + Prisma client.

---

---

## 🟡 P2 — PHASE C UI REDESIGN (sau Phase A+B gating, Tuần 6-9, 64h)

### Sprint UI-1 Design system + Foundation (16h)
- **UI-1-1** Design system tokens (typography 6 levels, 5 semantic colors, spacing scale) — 4h
- **UI-1-2** Workflow-first sidebar (7-step numbered nav + badge count) — 4h
- **UI-1-3** Workspace selector + project context provider — 4h
- **UI-1-4** Cmd+K global search palette + backend `/api/v1/search` — 4h

### Sprint UI-2 Workflow visualization (20h)
- **UI-2-1** Per-PR progress timeline component — 6h
- **UI-2-2** Dashboard "My actions" zone — 6h
- **UI-2-3** ✅ DONE — đã gộp, `/duyet` nay có 2 tab (So sánh báo giá · Duyệt + PO). Kiểm 2026-08-14.

### Sprint UI-3 Polish (12h)
- **UI-3-1** Responsive sidebar collapse — 4h
- **UI-3-2** Skeleton loading states — 3h
- **UI-3-3** Empty states với CTA + onboarding — 3h
- **UI-3-4** Inline edit approval/status — 2h

### Sprint UI-4 Power user (16h)
- **UI-4-1** Project workspace view (1 page tổng hợp 7 bước) — 10h
- **UI-4-2** Charts upgrade Recharts — 4h
- **UI-4-3** Keyboard shortcuts cheatsheet — 2h

---

## 🟠 P1 — Sprint 1 carry-over (parallel với Phase A nếu có capacity)

### ✅ DONE Sprint 1 (em làm 2026-05-25 17:20-18:00)
- **B-CPVT-005** Add BidQuoteOffer.qualitySource — DONE (1,509 EXCEL_SCRAPE records backfilled, schema mod + migration applied)
- **B-CPVT-004** scripts/audit_todos.sh — DONE (5 TODOs found, 0 stale)
- **B-CPVT-003** scripts/audit_routes.{sh,py} — DONE với caveat (11 false positives do middleware chain, cần improve detect handler-after-middleware)
- **B-CPVT-002** Audit hardcoded URLs — DONE (5 patterns đều có env fallback, 0 hard violations)

### TODO còn Sprint 1 (carry-over session sau)

### [P1] Build admin endpoint GET /api/v1/admin/ocr-diff/<entity>
- **ID:** B-CPVT-006
- **Estimate:** 4h
- **Description:** OCRP request "diff API" — query DB vs OCRP NDJSON, trả list cần update.
- **Depends on:** B-CPVT-001 v1.1 DONE ✅

### [P1] Build scripts/vendor_enrich_from_ocr.py
- **ID:** B-CPVT-012
- **NEW** (từ field coordination 19:00)
- **Estimate:** 3h
- **Description:** Consumer cho OCRP `vendor_master_v1.ndjson`. Match strategy combo C: taxCode strict → fuzzy name `rapidfuzz.token_set_ratio` cutoff 90. UPSERT Vendor table (134/136 hiện thiếu taxCode).
- **Depends on:** OCRP ship `vendor_master_v1.ndjson` (Sprint OCR-P5 task 2)

### [P1] Build scripts/invoice_items_import.py
- **ID:** B-CPVT-013
- **NEW** (từ field coordination 19:00)
- **Estimate:** 4h
- **Description:** Consumer cho OCRP `invoice_table_extractor` output. Create ContractDetail per line item (skip nếu items.length=0, giữ header). Backfill 1,416 INVOICE contracts với line items.
- **Depends on:** OCRP ship `invoice_table_extractor.py` + sample output (Sprint OCR-P5 task 1)

### [P1] Build scripts/material_subgroup_consume.py
- **ID:** B-CPVT-014
- **NEW** (từ field coordination 19:00)
- **Estimate:** 2h
- **Description:** Consumer cho OCRP material classifier. Update Material.materialSubGroupCode cho 3,802 rows (86% missing) by JOIN on rootKey hoặc fuzzy on (name+profile).
- **Depends on:** OCRP ship classifier output (Sprint OCR-P6 task 6)

### [P1] Build scripts/bid_offer_claude_read_consume.py
- **ID:** B-CPVT-015
- **NEW** (từ field coordination 19:00)
- **Estimate:** 3h
- **Description:** Consumer cho OCRP Sprint P3 scale Claude Read output. Import BidQuoteOffer với qualitySource="CLAUDE_READ". Idempotent on (itemId, vendorId).
- **Depends on:** OCRP Sprint P3 scale top-30 BID (rolling)

---

## 🟡 P2 — Next sprint (Sprint 2: 2026-06-02 → 06-08)

### [P2] Phase 4 OCR chứng chỉ MTR/CO/CQ (Claude Vision API, KHÔNG Gemini)
- **NEW from PLAN Sprint 2**
- **Estimate:** 24h (BE 16h + FE 8h)
- **Description:** Endpoint `/api/v1/documents/parse-certificate` extract MTR fields qua Claude Vision (re-use OCRP Sprint P3 pattern). Schema thêm `Certificate` model link với ContractDetail.

### [P2] Phase 0 task 0.4 — Shared status enums TS
- **ID:** B-CPVT-007
- **Description:** `shared/enums.ts` PR/PO/BID status, import FE+BE. Roadmap Phase 0.4.

### [P2] Phase 0 task 0.5 — dev.docker-compose.yml
- **ID:** B-CPVT-008
- **Description:** 1 command bring up PG + backend + frontend. Roadmap Phase 0.5.

### [P2] Phase 0 task 0.6 — i18n catalog top-20 strings
- **ID:** B-CPVT-009
- **Description:** Extract UI strings into `i18n/vi.ts`. Roadmap Phase 0.6.

### [P2] Phase 1.1 — Vitest + Supertest 15 smoke tests
- **ID:** B-CPVT-010
- **Estimate:** 8h
- **Description:** Critical paths: auth, bid upload, PO generate, peg, approval workflow.

### [P2] Improve scripts/audit_routes.py detect middleware chain
- **NEW** (từ Sprint 1 B-CPVT-003 caveat)
- **Estimate:** 1h
- **Description:** Hiện script flag 11 false positives vì lấy "last identifier before )" trong route, bị nhầm bởi middleware (`upload.single`, `restrictTo`). Refactor: detect handler là LAST identifier KHÔNG phải method-call.

---

## 🟢 P3 — Backlog

### [P3] Phase 1 — Foundation tasks (1.2 → 1.10)
- ESLint custom rules
- Zod validation middleware
- Pino structured logging
- CI/CD GitHub Actions
- HttpOnly cookie + CSRF
- ...
(xem [LONG_TERM_ROADMAP.md](LONG_TERM_ROADMAP.md))

### [P3] Phase 2 — Hardening
- Phase 4 OCR chứng chỉ MTR/CO/CQ (Gemini Vision)
- i18n full catalog
- Storybook
- Sentry + OpenTelemetry
- OpenAPI auto-gen
- ADR docs
- Per-PR preview env
- E2E Playwright

---

## ⚪ P4 — Someday/maybe

### [P4] Phase 3 — Sustainability
- Multi-language (EN)
- Role-based UI
- Notification system
- Audit dashboard
- Mobile-responsive QC
- Documentation site
- Pen-test

### [P4] Cân nhắc Obsidian Dataview plugin
- **ID:** B-CPVT-011
- **Created:** 2026-05-25 16:42
- **Status:** DECLINED 2026-05-25 (giữ markdown static)
- **Trigger revisit nếu:**
  - SESSIONS_OVERVIEW > 20 sessions → update thủ công không xuể
  - BACKLOG_AGGREGATE > 50 entries → cần sort/filter động
  - Cross-session query thường xuyên (vd "tất cả P1 owner cpvt-be")
- **Cost nếu cài:** Manual install plugin + refactor frontmatter của ~5 manifest files + 2-3 BACKLOG files để query được
- **Benefit:** Dynamic dashboard tự refresh từ frontmatter thay vì sửa tay; sample queries em đã chuẩn bị trong head (sessions table, backlog aggregate, recent decisions)

---

## 📚 Done — moved to CHANGES_LOG.md

Xem [CHANGES_LOG.md](CHANGES_LOG.md) cho lịch sử completed.

---

## 📜 Rules

Same as `_sessions/BACKLOG_TEMPLATE.md` §Rules.
