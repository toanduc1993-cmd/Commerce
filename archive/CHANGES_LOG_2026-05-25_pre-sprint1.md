# CHANGES_LOG archive — 2026-05-25 (settled work pre-Sprint 1)

> Archived 2026-05-25 17:20 từ CHANGES_LOG.md để giảm size cho Sprint 1.
> Categories: OCR migration, infra setup, multi-session protocol, manager architecture, initial bug fixes.
> Active entries giữ ở [CHANGES_LOG.md](../CHANGES_LOG.md).

---

### 16:42 | decision: Dataview plugin DECLINED (giữ markdown static)
**What:** User check Obsidian Dataview plugin → không có (vault chỉ core plugins, không có `.obsidian/plugins/` folder). User quyết định skip, giữ markdown static.
**Files:**
- `VẬT TƯ/BACKLOG.md` — add P4 entry B-CPVT-011 với trigger conditions để revisit
**Schema change?** No.
**Verify:** `.obsidian/plugins/` absent, `community-plugins.json` absent → confirm Dataview not installed.
**Rationale documented:** Trigger revisit khi SESSIONS_OVERVIEW > 20, BACKLOG_AGGREGATE > 50, hoặc cross-session query thường xuyên.
**Rollback:** N/A (chỉ là decision + 1 BACKLOG entry P4).

---

### 16:35 | task done: B-CPVT-001 Export BID_QUOTE + PrDetail master NDJSON (spawn cpvt-be sub)
**What:** Spawn `cpvt-be` sub-session để bắt đầu task P0. Export 2 master NDJSON từ DB → file system. Send message OCRP unblock B-OCRP-001.
**Files:**
- `VẬT TƯ/scripts/export_to_ocr_index.py` — NEW (~90 LOC psycopg2 export script với UTF-8, datetime serialize, manifest)
- `VẬT TƯ/exports/bid_quote_master.ndjson` — NEW 1,598,668 bytes (1,578 records, 36 fields camelCase)
- `VẬT TƯ/exports/prdetail_master.ndjson` — NEW 918,088 bytes (1,351 records, 24 fields)
- `VẬT TƯ/exports/manifest.json` — NEW (timestamp + counts + file metadata)
- `_sessions/_inbox/ocrp/20260525_163531_cpvt_db-export-ready.md` — message OCRP với schema details
- `_sessions/_outbox/cpvt/20260525_163531_to-ocrp_db-export-ready.md` — audit
- `VẬT TƯ/BACKLOG.md` — move B-CPVT-001 từ P0 → done
- `_sessions/_dashboard/BACKLOG_AGGREGATE.md` — update P0 count 2→1, stats CPVT 10→9
- `_sessions/_dashboard/SESSIONS_OVERVIEW.md` — cpvt-be active, cpvt last_seen 16:35
- `_sessions/_shared/STATE.md` — update CPVT outgoing requests
**Schema change?** No.
**Verify:**
- Script run trong 2s, 2929 records total
- Sample bid_quote_master: `{contractNo: "03.10.2025/APEC-IBS", vendorName: "APEC", totalNoVAT: 3576654.5...}` ✓
- Sample prdetail_master: `{itemCode: "I90-A1", itemName: "Bulong móng", ...}` ✓
- 36 fields ContractDetail + 24 fields PrDetail Prisma-compatible camelCase
- B-OCRP-001 unblocked (BLOCKED → ready to proceed)
**Browser refresh:** N/A (backend task).
**Rollback:**
1. `rm -rf VẬT\ TƯ/exports/`
2. `git checkout HEAD -- VẬT\ TƯ/scripts/export_to_ocr_index.py`
3. Revert BACKLOG.md + dashboards

**Sub-session note:** Đây là spawn đầu tiên của Tier 2 sub-session (cpvt-be). Workflow đơn giản: vẫn run trong CPVT context, chỉ tag owner trong BACKLOG.

---

### 16:30 | infra: WORK_RECLASSIFICATION — 50+ works phân theo session
**What:** User yêu cầu kiểm tra + phân loại toàn bộ công việc theo hệ thống session vừa định nghĩa. Em tạo comprehensive reclassification.
**Files:**
- `_sessions/_dashboard/WORK_RECLASSIFICATION.md` — NEW (~350 lines):
  - 50+ works phân theo OCRP (25) / CPVT (22) / MGR (8) / DA (10) / cross-session (6)
  - 5 phases timeline 2026-04-06 → 2026-05-25
  - Files ownership matrix (CPVT/OCRP/MGR/DA)
  - Activity timeline ASCII diagram
  - 4 insights + 4 future recommendations
- `_sessions/_dashboard/MAIN.md` — thêm link WORK_RECLASSIFICATION
**Schema change?** No.
**Verify:** File tổng hợp 5 phases OCRP + 3 phases CPVT + cross-session collabs + ownership matrix.
**Browser refresh:** N/A.
**Rollback:** `rm _sessions/_dashboard/WORK_RECLASSIFICATION.md && git checkout HEAD -- _sessions/_dashboard/MAIN.md`

---

### 16:21 | infra: OCRP BACKLOG tạo + cycle complete + dashboard sync
**What:** OCRP (roleplay) tạo BACKLOG.md 14 entries trong workspace ibs-ocr theo template. CPVT pickup reply, sync dashboard SESSIONS_OVERVIEW + BACKLOG_AGGREGATE, STATE.md.
**Files:**
- `IBSHI/mua-hang/02.CONG-CU/ibs-ocr/BACKLOG.md` — NEW (14 entries: 1×P0, 4×P1, 3×P2, 4×P3, 2×P4)
- `_sessions/_inbox/cpvt/20260525_162114_ocrp_backlog-created.processed.md` — OCRP reply
- `_sessions/_outbox/ocrp/20260525_162114_to-cpvt_backlog-created.md` — audit
- `_sessions/_inbox/ocrp/*.processed.md` — 2 messages marked processed
- `_sessions/_dashboard/SESSIONS_OVERVIEW.md` — update row OCRP (14 backlog, 0 inbox)
- `_sessions/_dashboard/BACKLOG_AGGREGATE.md` — add OCRP entries P0-P2, update stats (Total 24 = CPVT 10 + OCRP 14)
- `_sessions/_shared/STATE.md` — update OCRP section
**Schema change?** No.
**Verify:** 24 backlog entries cross-session aggregated. Top blocker B-CPVT-001 unblocks B-OCRP-001.
**Browser refresh:** N/A.
**Rollback:** rm IBSHI/mua-hang/02.CONG-CU/ibs-ocr/BACKLOG.md + revert dashboard files.

---

### 16:10 | infra: Manager Session architecture + tier hierarchy + per-session BACKLOG
**What:** User yêu cầu hệ thống 1 Manager + nhiều session con tiered, mặc định mở VSCode show Manager + Hưng pick session, mọi session có BACKLOG riêng. Em setup architecture đầy đủ.
**Files:**
- `_sessions/MANAGER.md` — NEW manifest MGR Tier 0
- `_sessions/_dashboard/MAIN.md` — NEW Hưng entry point (Quick Navigate, inbox status, recent decisions)
- `_sessions/_dashboard/SESSIONS_OVERVIEW.md` — NEW table 11 sessions (T0 + 3 T1 + 7 T2 on-demand)
- `_sessions/_dashboard/BACKLOG_AGGREGATE.md` — NEW cross-session aggregate
- `_sessions/BACKLOG_TEMPLATE.md` — NEW template cho mọi session
- `VẬT TƯ/BACKLOG.md` — NEW, 10 entries (B-CPVT-001 → 010, từ LONG_TERM_ROADMAP Phase 0+1)
- `IBSHI-Vault.code-workspace` — NEW (vault root, 4 folders multi-root, task auto-open MAIN.md on folderOpen)
- `VẬT TƯ/CLAUDE.md:5-15,114-124` — update tier identity + reference 6 files Manager/BACKLOG
- `_sessions/_inbox/ocrp/20260525_160900_cpvt_request-create-backlog.md` — request OCRP tạo BACKLOG riêng
- `_sessions/_inbox/cpvt/20260525_160000_ocrp_re-handshake-ping.processed.md` — pickup OCRP real reply, marked
- `_sessions/_inbox/ocrp/20260525_160834_cpvt_re-handshake-answers.md` — reply 4 questions OCRP
- `_sessions/_shared/STATE.md` — add MGR section, update CPVT
**Schema change?** No (docs + folder structure).
**Verify:** Files load OK, links work, workspace JSON valid.
**Browser refresh:** N/A (architecture-level).
**Rollback:**
1. `rm -rf _sessions/_dashboard _sessions/MANAGER.md _sessions/BACKLOG_TEMPLATE.md`
2. `rm VẬT\ TƯ/BACKLOG.md IBSHI-Vault.code-workspace`
3. `git checkout HEAD -- VẬT\ TƯ/CLAUDE.md _sessions/_shared/STATE.md`

**Hard rule mới:** Mỗi session phải có BACKLOG.md per Hưng request. Template `_sessions/BACKLOG_TEMPLATE.md`. Đã tạo cho CPVT. Đã gửi OCRP request tạo riêng.

---

### 20:30 | test: Handshake CPVT ↔ OCRP cycle thành công
**What:** Test end-to-end multi-session protocol. CPVT (Code Platform Vật Tư) gửi handshake-ping → OCRP (Phối hợp Backend và Data OCR) ACK + report status + đề xuất tasks. Cả 2 chiều mark processed + STATE update.
**Files:**
- `_sessions/ocrp.md` — NEW manifest OCRP (name "Phối hợp Backend và Data OCR", role bridge)
- `_sessions/_inbox/ocrp/20260525_155649_cpvt_handshake-ping.processed.md` — message từ CPVT
- `_sessions/_outbox/cpvt/20260525_155649_to-ocrp_handshake-ping.md` — audit trail
- `_sessions/_inbox/cpvt/20260525_155752_ocrp_re-handshake-ping.processed.md` — reply OCRP
- `_sessions/_outbox/ocrp/20260525_155752_to-cpvt_re-handshake-ping.md` — audit trail
- `_sessions/_shared/STATE.md` — updated both sections (CPVT + OCRP) với last_seen + status
**Schema change?** No (protocol test).
**Verify:**
- Cấu trúc folder đúng PROTOCOL.md §2
- Frontmatter parse OK (correlation_id giữ nguyên qua reply)
- Workflow rename `.md → .processed.md` áp dụng cả 2 phía
- Discrepancy caught: project_master_index OCR có 51, CPVT message ghi 50 → flagged trong reply + STATE
**Browser refresh:** N/A.
**Rollback:** `rm _sessions/_inbox/{cpvt,ocrp}/2026*.* _sessions/_outbox/{cpvt,ocrp}/2026*.* && git checkout HEAD -- _sessions/_shared/STATE.md`

---

### 20:00 | infra: Multi-session protocol + định danh CPVT
**What:** User yêu cầu định danh session để future sessions tự coordinate. Em thiết lập:
- Session ID: `cpvt` (Code Platform Vật Tư)
- Tạo `HUNGTH OBSIDIAN/_sessions/` registry (PROTOCOL + manifest + inbox/outbox/shared state)
- File-based message protocol async (vì Claude sessions không IPC trực tiếp)
**Files:**
- `_sessions/PROTOCOL.md` — NEW (định nghĩa session IDs, message format, workflow nhận-trả lời, hard rules)
- `_sessions/cpvt.md` — NEW manifest session này
- `_sessions/_inbox/cpvt/`, `_sessions/_outbox/cpvt/`, `_sessions/_shared/` — folders
- `_sessions/_shared/STATE.md` — NEW (snapshot DB stats + services + recent decisions)
- `VẬT TƯ/SESSION_IDENTITY.md` — NEW (declare cpvt + boot sequence)
- `VẬT TƯ/CLAUDE.md:5-12` — thêm Session identity section + 3 bắt buộc khi start
**Schema change?** No (docs + folders only).
**Verify:** Cấu trúc folder đúng, files load được, links work.
**Browser refresh:** N/A.
**Rollback:**
1. `rm -rf "HUNGTH OBSIDIAN/_sessions/"`
2. `rm VẬT\ TƯ/SESSION_IDENTITY.md`
3. `git checkout HEAD -- VẬT\ TƯ/CLAUDE.md`

---

### 19:30 | infra: LONG_TERM_ROADMAP + Rule #8 NO BAND-AID
**What:** User yêu cầu lộ trình lâu dài để tránh fix nhỏ lặp lại. Em:
- Phân tích 22 small fixes (2 ngày) → 8 nhóm pattern (A-H) với root cause
- Tạo `LONG_TERM_ROADMAP.md` 4 phases (Quick wins → Foundation → Hardening → Sustainability), 6+8+8+7 = 29 tasks, KPI metrics tracking
- Thêm Rule #8 "NO BAND-AID" vào CLAUDE.md: trước khi fix bug nhỏ, đối chiếu roadmap → propose task Phase X thay vì chỉ vá lẻ
**Files:**
- `LONG_TERM_ROADMAP.md` — NEW (~150 lines, 4 phases + KPIs + execution principles)
- `CLAUDE.md:99-110` — Rule #8 NO BAND-AID checklist
- `CLAUDE.md:120` — Reference link to LONG_TERM_ROADMAP
**Schema change?** No.
**Verify:** File created, links work, count 8 patterns + 29 tasks + 6 KPIs.
**Browser refresh:** N/A (docs-only).
**Rollback:** `rm LONG_TERM_ROADMAP.md && git checkout HEAD -- CLAUDE.md`

---

### 19:00 | infra: HARD RULES + auto-compact launchd agent
**What:** User yêu cầu cơ chế nén làm rule cứng cho mọi session. Em:
- Tạo CLAUDE.md ở root VẬT TƯ với 7 hard rules (auto-load khi Claude Code mở folder)
- Update DEVOPS_NOTES.md workflow thêm step 6 "AUTO-COMPACT check"
- Setup launchd agent chạy `compact_logs.sh` mỗi Chủ nhật 02:00 (loaded + verified)
**Files:**
- `VẬT TƯ/CLAUDE.md` — NEW (7 hard rules: log mỗi sửa, auto-compact, đọc DEVOPS first, servers terminal riêng, tailwind workaround, schema migration không dùng `migrate dev`, feature checklist)
- `VẬT TƯ/DEVOPS_NOTES.md:8-18` — thêm step 6 auto-compact + section "Auto-compact (launchd)"
- `~/Library/LaunchAgents/com.ibshi.vattu.compactlogs.plist` — NEW launchd job
**Schema change?** No.
**Verify:**
- `launchctl list | grep ibshi` → `com.ibshi.vattu.compactlogs` listed
- Manual run `bash scripts/compact_logs.sh` → "181 lines, dưới ngưỡng 500 — không cần nén" ✓
**Browser refresh:** N/A (infra-only).
**Rollback:**
1. `launchctl unload ~/Library/LaunchAgents/com.ibshi.vattu.compactlogs.plist && rm ~/Library/LaunchAgents/com.ibshi.vattu.compactlogs.plist`
2. `rm VẬT\ TƯ/CLAUDE.md`
3. Revert DEVOPS_NOTES.md changes via git

---

### 18:30 | infra: Auto-compact log script
**What:** Tạo `scripts/compact_logs.sh` để tự nén CHANGES_LOG.md khi vượt ngưỡng 500 dòng — entries cũ hơn 30 ngày archived sang `archive/CHANGES_LOG_until_<date>.md`. Tạo `CHANGES_LOG_INDEX.md` auto-index. Giữ nguyên Template + Quy tắc footer.
**Files:**
- `scripts/compact_logs.sh` — NEW (chmod +x)
**Schema change?** No.
**Verify:** Hiện 170 dòng, chưa trigger. Test khi >500 dòng sẽ chạy `./scripts/compact_logs.sh` manual hoặc cron.
**Browser refresh:** N/A (script độc lập).
**Rollback:** `rm scripts/compact_logs.sh`

---

### 17:30 | feature: Duyệt Báo Giá (per-item vendor approval)
**What:** Thêm trang `/duyet-bao-gia` cho workflow phê duyệt báo giá theo từng item (mỗi item chọn 1 NCC riêng). Phía bid-level (`/so-sanh-bao-gia`) chỉ chọn được 1 NCC cho cả bid. Trang mới cho phép NCC khác nhau theo item + tự tổng hợp thành bảng grouped by NCC.
**Files:**
- `backend/src/controllers/bidAnalysisController.js:298-396` — `selectItemVendor()` (PATCH item.selectedVendorName + verify vendor thuộc bid) + `getApprovalSummary()` (aggregate items grouped by NCC, compute totalValue per group)
- `backend/src/controllers/bidAnalysisController.js:434-436` — Export 2 functions mới
- `backend/src/routes/procurementRoutes.js:37,123-128` — Register `GET /api/v1/bid-analyses/:id/approval-summary` + `PATCH /api/v1/bid-analyses/:bidId/items/:itemId/select-vendor`
- `frontend/src/lib/api.ts:558-616` — `selectItemVendor()` + `fetchApprovalSummary()` helpers + `ApprovalSummary` interface
- `frontend/src/components/layout/Sidebar.tsx:35` — Add link "Duyệt Báo Giá" (icon `how_to_reg`, path `/duyet-bao-gia`)
- `frontend/src/app/duyet-bao-gia/page.tsx` — NEW FILE (375 lines): sidebar list bids + main 2-section view (item table với dropdown chọn NCC + bảng tổng hợp grouped by NCC tự auto-update khi chọn)
**Schema change?** No — dùng field `BidQuoteItem.selectedVendorName` (đã có sẵn từ trước trong schema).
**Verify:**
- PATCH `/bid-analyses/<id>/items/<itemId>/select-vendor` body `{vendorName:"GLOBAL"}` → `{success:true}`
- GET `/approval-summary` sau khi chọn → trả `assignedItems:1, byVendor:[{vendorName:"GLOBAL", itemCount:1, totalValue:231}]`
- Frontend `/duyet-bao-gia?bid=<id>` HTTP 200 trong 0.2s
**Browser refresh:** Backend node --watch tự reload (log "Restarting"). Frontend Turbopack HMR. User F5 thấy menu mới + page mới hoạt động.
**Test trên browser:** http://localhost:3001/duyet-bao-gia → chọn 1 bid → ở cột "NCC duyệt" cuối table chọn dropdown → toast confirm + bảng dưới tự cập nhật grouped by NCC.
**Rollback:**
1. `git checkout HEAD -- backend/src/controllers/bidAnalysisController.js backend/src/routes/procurementRoutes.js frontend/src/lib/api.ts frontend/src/components/layout/Sidebar.tsx`
2. `rm frontend/src/app/duyet-bao-gia/page.tsx && rmdir frontend/src/app/duyet-bao-gia`
3. SQL: `UPDATE "BidQuoteItem" SET "selectedVendorName"=NULL WHERE updated > '2026-05-25 17:00'` (chỉ nếu cần)
4. Restart backend

---

### 16:00 | feature: Tải file gốc báo giá
**What:** Trước đây upload Excel → app parse vào DB rồi vứt file. User không re-review được số liệu vs file gốc. Em add: save file + endpoint download + UI button.
**Files:**
- `backend/prisma/schema.prisma:336-339` — Add 3 fields `BidAnalysis.{sourceFileName, sourceFilePath, sourceSheetName}` (TEXT nullable)
- `backend/src/controllers/bidAnalysisController.js:1-25` — Import fs/path + `sanitizeFileName()`
- `backend/src/controllers/bidAnalysisController.js:55-65` — Save buffer to `uploads/bid-analyses/<ts>_<name>.xlsx`, fix multer UTF-8 mojibake
- `backend/src/controllers/bidAnalysisController.js:108,124` — Store sourceFile* trong create/update BidAnalysis
- `backend/src/controllers/bidAnalysisController.js:296-318` — New `downloadSourceFile()` function
- `backend/src/routes/procurementRoutes.js:37,120` — Import + register `GET /api/v1/bid-analyses/:id/download`
- `backend/src/services/bidAnalysisParser.js:291` — Expose `sheetName` field từ parser
- `frontend/src/lib/api.ts:493-495` — Add 3 fields vào `BidAnalysisRow` interface
- `frontend/src/app/so-sanh-bao-gia/page.tsx:145-205` — Nút "Tải file gốc" trong header + fetch blob download
**Schema migration:** ADD 3 columns to BidAnalysis (additive, không destructive). Applied via `npx prisma migrate diff ... --script | psql -1 -f`.
**Verify:** Upload `109_Rev D1.xlsx` → 15 bids created, file saved 2.6MB. Download HTTP 200, Content-Disposition UTF-8 RFC5987. Frontend nút hiển thị + click → browser download.
**Browser refresh:** Sau Edit → backend auto-restart (node --watch) → frontend hot-reload qua Turbopack → user F5 thấy nút mới.
**Rollback:**
1. `git checkout HEAD -- backend/prisma/schema.prisma backend/src/controllers/bidAnalysisController.js backend/src/routes/procurementRoutes.js backend/src/services/bidAnalysisParser.js frontend/src/lib/api.ts frontend/src/app/so-sanh-bao-gia/page.tsx`
2. SQL: `ALTER TABLE "BidAnalysis" DROP COLUMN "sourceFileName", DROP COLUMN "sourceFilePath", DROP COLUMN "sourceSheetName"`
3. `rm -rf backend/uploads/bid-analyses/`
4. Restart backend

---

### 11:25 | infra: Fix tailwindcss resolver — Next 16 Turbopack
**What:** Next 16 Turbopack PostCSS resolver tìm `tailwindcss` từ project parent (`VẬT TƯ/`) thay vì `frontend/node_modules/`. Frontend "Ready" nhưng compile hang vô hạn, curl HTTP 000.
**Files:**
- `VẬT TƯ/node_modules/tailwindcss` → symlink to `frontend/node_modules/tailwindcss`
- `VẬT TƯ/node_modules/@tailwindcss` → symlink to `frontend/node_modules/@tailwindcss`
**Verify:** `curl http://localhost:3001/login` → HTTP 200, 16KB HTML response. 12/12 routes HTTP 200.
**Browser refresh:** Cần `rm -rf frontend/.next` + restart Next dev sau khi tạo symlink (hot-reload không pickup symlink mới).
**Rollback:**
```sh
rm "VẬT TƯ/node_modules/tailwindcss" "VẬT TƯ/node_modules/@tailwindcss"
rmdir "VẬT TƯ/node_modules" 2>/dev/null  # if empty
```

---

### 10:30 | bugfix: 4 fixes critical (login, PO logic, admin route, mock cleanup)
**What:** Audit phát hiện 1 TODO critical + 3 issue high. Em fix batch.

**Fix #3 — Login page misleading hint**
- `frontend/src/app/login/page.tsx:17-37` — URL hardcode → env var `NEXT_PUBLIC_API_URL`
- `frontend/src/app/login/page.tsx:79` — Placeholder "Nhập 123456 nếu chưa có tài khoản" → "••••••••"
- `frontend/src/app/login/page.tsx:118-123` — "Mẹo: tự khởi tạo User" → "Liên hệ Quản trị viên"

**Fix #1 — PO completion logic (3 bugs trong 1 chỗ)**
- `backend/src/controllers/poController.js:207-219` —
  - Bỏ hardcoded `allContractsDelivered = true` → query thực `ContractDetail`
  - Fix ternary inversion: `? PARTIAL_RECEIVED : FULLY_RECEIVED` → `? FULLY_RECEIVED : PARTIAL_RECEIVED`
  - Fix enum sai: `PARTIALLY_RECEIVED` → `PARTIAL_RECEIVED` (theo schema)

**Fix #4 — Expose admin user creation**
- `backend/src/routes/authRoute.js:4,10` — Import `restrictTo` + add `POST /api/v1/auth/users` (ADMIN only)

**Fix #9 — Cleanup mock data residue**
- `frontend/src/app/mua-hang/page.tsx:21-23` — Bỏ `MOCK_PRS, MATERIAL_GROUPS` import; add `API_URL` const
- `frontend/src/app/mua-hang/page.tsx:271,276` — `useState<PRDetail[]>([])` thay vì `MOCK_PRS`; `isUsingMock=false`
- `frontend/src/app/mua-hang/page.tsx:284,331` — 2 hardcoded `http://localhost:5005` → `${API_URL}`

**Verify:** Backend `curl /health` OK, frontend `/login`/`/mua-hang` HTTP 200. Login form không còn hint sai.
**Rollback:** `git checkout HEAD -- <files above>`

---

## 2026-05-23

### Schema migration: OCR data → VẬT TƯ DB
**What:** Migrate 4,440 materials + 1,416 invoices + 47 projects + 40 vendors từ OCR pipeline vào VẬT TƯ DB. Cần schema mod để chứa.
**Files:**
- `backend/prisma/schema.prisma` — Add `Material` model (mới); Add `ContractDetail.dataSource/projectCode/ocrInvoiceStt/ocrScanRef`; Relax `ContractDetail.prDetailId` → optional
- `02.CONG-CU/ibs-ocr/migrate_ocr_to_vattu.py` — New file, 5 phases idempotent
- Backfill 1,578 existing `ContractDetail.dataSource = 'BID_QUOTE'`
**Migration:** Via `npx prisma migrate diff ... --script | psql -1 -f` (KHÔNG dùng `migrate dev` vì sẽ reset DB mất data).
**Backup:** `backend/pg_data/backup_20260523_151255.sql` (1.5MB).
**Verify:** Post-migration counts: Project 52 (was 5), Vendor 136 (was 124), Material 4,440 (new), ContractDetail 2,994 (1,578 BID_QUOTE + 1,416 INVOICE).
**Rollback:**
```sh
psql -U vpi_user -d vpi_procurement -c "DROP DATABASE vpi_procurement"
psql -U vpi_user -d postgres -c "CREATE DATABASE vpi_procurement"
psql -U vpi_user -d vpi_procurement -f backend/pg_data/backup_20260523_151255.sql
```

---

## Template entry (copy khi tạo mới)

```markdown
### YYYY-MM-DD HH:MM | TYPE
**What:** Mục đích thay đổi
**Files:**
- path:line — what changed
**Schema change?** Yes/No (nếu yes, ghi rõ SQL migration)
**Verify:** Test command + expected output
**Browser refresh:** Backend auto-reload? Frontend HMR pickup? Cần clear cache?
**Rollback:** git/SQL commands
```

---

## Quy tắc workflow Claude

### Trước khi sửa
1. Đọc CHANGES_LOG.md xem file định sửa có entry gần đây không (tránh conflict)
2. Đọc DEVOPS_NOTES.md xem có gotcha gì với file/feature đó

### Khi sửa
3. Edit code
4. **Verify hot-reload picked up:**
   - Backend (node --watch): check `tail -3 /tmp/vattu-logs/backend.log` thấy "Restarting"
   - Frontend (Turbopack): không cần check explicit, nhưng nếu đụng config/postcss → `rm -rf frontend/.next + restart`
5. **Trigger compile** (cho Next dev chỉ compile khi request):
   - `curl -s -m 30 -o /dev/null -w "%{http_code}\n" http://localhost:3001/<route-vừa-sửa>`
   - Đảm bảo HTTP 200, không có error trong frontend log
6. Test API thay đổi qua curl (nếu backend)

### Sau khi sửa
7. **Add entry vào CHANGES_LOG.md** (1 entry per logical fix, không gộp)
8. Báo user: "Đã sửa xong + browser-ready, refresh để check"
9. Nếu schema/infra change → cũng update DEVOPS_NOTES.md
