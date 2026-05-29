# RESUME_INSTRUCTIONS.md — Hướng dẫn session sau pickup nhanh

> **Created:** 2026-05-25 18:00 trước khi Hưng tắt máy
> **Mục đích:** Session sau (CPVT hoặc khác) mở Claude Code → đọc file này → biết ngay đang ở đâu, làm gì tiếp.

---

## 🎯 Hiện trạng tóm tắt (snapshot)

**Sprint 1 status: 4/8 tasks DONE trong session 2026-05-25 17:20-18:00**

| Task | Status | Notes |
|---|---|---|
| B-CPVT-005 qualitySource field | ✅ DONE | Schema mod applied, 1,509 BidQuoteOffer marked EXCEL_SCRAPE |
| B-CPVT-004 audit_todos.sh | ✅ DONE | Script ready, 5 TODOs found 0 stale |
| B-CPVT-003 audit_routes.{sh,py} | ✅ DONE (caveat) | Script work nhưng 11 false positives — task improve ở Sprint 2 |
| B-CPVT-002 audit hardcoded URLs | ✅ DONE | 0 hard violations, 5 fallback patterns clean |
| B-CPVT-006 admin /ocr-diff endpoint | TODO Sprint 1 carry-over | 4h estimate, sẽ làm session sau |
| B-OCRP-001 cross-check sau v1.1 | OCRP own | Chờ OCRP pickup |
| B-OCRP-002 P4 adapter | OCRP IN_PROGRESS | OCRP own |
| B-CPVT-007/008/009 | P2 Sprint 2 | Defer |

**Bug fix critical đã xong (16:35 → 17:10):**
- DA flagged 4 issues v1.0 export → em fix v1.1 (projectCode 100%, UOM normalize, multi-currency VND, float precision)
- Files: `VẬT TƯ/exports/{bid_quote_master,prdetail_master}_v1.1.ndjson` + manifest

---

## 🚀 Khi mở Claude Code session sau

### Bước 1: Boot sequence (theo CLAUDE.md hard rules)
```sh
# 1. Đọc CLAUDE.md (8 hard rules)
# 2. Đọc DEVOPS_NOTES.md (6 gotchas) — đặc biệt tailwind symlink + PG restart
# 3. Đọc BACKLOG.md — biết task đang TODO
# 4. Check inbox: ls _sessions/_inbox/cpvt/*.md | grep -v processed
```

### Bước 2: Restart services (nếu PG/backend/frontend down sau tắt máy)
```sh
# Tab 1 - PG
cd "/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/VẬT TƯ/backend"
rm -f pg_data/postmaster.pid
/opt/homebrew/opt/postgresql@18/bin/pg_ctl -D pg_data -l pg_data/server.log start -o "-p 54321"

# Tab 2 - Backend
cd "/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/VẬT TƯ/backend"
npm run dev

# Tab 3 - Frontend (nhớ port 3001 + env, KHÔNG 3000)
cd "/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/VẬT TƯ/frontend"
PORT=3001 NEXT_PUBLIC_API_URL=http://localhost:5005 npm run dev
```

### Bước 3: Verify
```sh
curl -s http://localhost:5005/health
# expect: {"status":"ok","db":"connected",...}

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/login
# expect: 200
```

---

## 📋 Task tiếp theo (priority order)

### 🔥 P0 — Critical (do ngay)

(none — B-CPVT-001 v1.1 done, B-OCRP-001 chờ OCRP)

### 🟠 P1 Sprint 1 carry-over

#### B-CPVT-006 admin endpoint GET /api/v1/admin/ocr-diff/<entity>
- **Estimate:** 4h
- **Description:** OCRP yêu cầu diff API (handshake Q3). Query DB current vs OCRP NDJSON latest, trả list cần update.
- **Files dự kiến:**
  - NEW: `backend/src/controllers/adminController.js`
  - NEW: `backend/src/routes/adminRoutes.js` (mount /api/v1/admin)
  - Update: `backend/src/app.js` (mount route)
- **Logic:**
  ```js
  GET /api/v1/admin/ocr-diff/:entity?since=2026-05-23
  // entity in: bid_quote | prdetail | vendor | invoice | project | material
  // Compare:
  //   DB: SELECT * FROM <Entity> WHERE updatedAt >= since
  //   OCR source: VẬT TƯ/exports/<entity>_master_v1.1.ndjson hoặc OCRP _index/*.ndjson
  // Return: {entity, total_db, total_ocr, in_db_not_ocr, in_ocr_not_db, mismatched: [...]}
  ```
- **Auth:** verifyToken + restrictTo('ADMIN')

### 🟡 P2 Sprint 2 (Week 2: 06-02 → 06-08)

| ID | Task | Estimate |
|---|---|---:|
| **Phase 4 OCR chứng chỉ** | Claude Vision API endpoint + Certificate model + FE upload UI | 24h |
| Vitest + 15 smoke tests | Auth, PR upload, PO gen, peg, approval | 8h |
| ESLint custom rules | block hardcoded URLs etc. | 4h |
| B-OCRP-002 P4 adapter (OCRP) | Em không own, OCRP làm | — |
| B-OCRP-005 Build OCR BID_QUOTE master (OCRP) | Em không own | — |

---

## 📨 Inbox status (cần check session sau)

| Session | Pending |
|---|---|
| CPVT | 0 unprocessed (all clean) |
| OCRP | 2 outgoing chờ OCRP pickup: db-export-ready (v1.0 stale) + db-export-ready-v1.1 |
| DA | 1 outgoing chờ DA verify v1.1 fix: re-b-cpvt-001-v2-done |
| MGR | 0 |

→ Khi OCRP/DA spawn next, họ sẽ pickup. Session sau CPVT chỉ cần check `_inbox/cpvt/` có mới không.

---

## 🗺️ Big picture references

| File | Mục đích |
|---|---|
| [PLATFORM_COMPLETION_PLAN.md](PLATFORM_COMPLETION_PLAN.md) | 4 tracks × 4 sprints (155h) — Sprint 1 đang chạy |
| [LONG_TERM_ROADMAP.md](LONG_TERM_ROADMAP.md) | 4 phases (Quick wins → Foundation → Hardening → Sustainability) |
| [BACKLOG.md](BACKLOG.md) | Pending tasks Sprint 1 carry-over + Sprint 2 lined up |
| [CHANGES_LOG.md](CHANGES_LOG.md) | Latest entries (older archived) |
| [archive/CHANGES_LOG_2026-05-25_pre-sprint1.md](archive/CHANGES_LOG_2026-05-25_pre-sprint1.md) | Settled work (OCR migration, infra setup, manager architecture, file source feature, duyệt báo giá) |
| [DEVOPS_NOTES.md](DEVOPS_NOTES.md) | 6 gotchas (tailwind symlink, PG postmaster.pid, multer UTF-8, etc.) |
| [CLAUDE.md](CLAUDE.md) | 8 hard rules — auto-load mọi session |

---

## 🔑 Decisions Hưng đã chốt (2026-05-25 17:20)

| # | Decision | Choice | Implementation note |
|---|---|---|---|
| 1 | OCR Vision API | **Claude API** (KHÔNG Gemini) | Re-use OCRP Sprint P3 pattern khi làm Phase 4 |
| 2 | FX historical | Hardcode 25000 | Đã apply trong export_to_ocr_index.py |
| 3 | Test coverage | 60% critical paths | Sprint 2 (Vitest 15 tests) |
| 4 | Deploy target | LAN nginx | Config đã có ở `deploy/nginx/` |
| 5 | Sub-sessions | Tag-only | Không cần terminal riêng |

---

## ⚠️ Lưu ý CRITICAL

1. **Sprint 1 carry-over còn:** B-CPVT-006 (4h) — bắt đầu session sau từ đây
2. **OCRP đang IN_PROGRESS:** B-OCRP-002 P4 Platform Adapter — em (CPVT) chờ ping draft
3. **DA pending verify v1.1:** chờ confirm OK trước khi deprecate v1.0
4. **CHANGES_LOG đã compact:** 410 → 78 dòng, archive ở `archive/CHANGES_LOG_2026-05-25_pre-sprint1.md`
5. **Compact rule:** giữ CHANGES_LOG < 500 dòng. Sprint 2 sẽ tăng → trigger compact lần 2 khi cần.

---

## 🎬 Cụm command "start working" cho session sau

```sh
# 1. Open VSCode workspace
open "/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/IBSHI-Vault.code-workspace"

# 2. (sẽ tự open Manager dashboard _sessions/_dashboard/MAIN.md)

# 3. Restart 3 services (3 tabs terminal — xem section "Khi mở Claude Code session sau" ở trên)

# 4. Browser test:
open http://localhost:3001/login
# login: hungth / 123456
# Pages mới có:
# - /duyet-bao-gia (per-item vendor approval) — feature mới
# - /so-sanh-bao-gia (download file gốc) — feature mới

# 5. Claude Code: bảo em "tiếp tục Sprint 1 task B-CPVT-006"
```

---

## 📊 Last state files (timestamps)

- CHANGES_LOG.md: 78 lines (3 latest entries) — 17:15
- BACKLOG.md: ~120 lines — 17:55
- _sessions/_shared/STATE.md: 17:20
- _sessions/_dashboard/MAIN.md: 17:15
- PLATFORM_COMPLETION_PLAN.md: 240 lines — 17:15

---

## 💬 Note cho em (CPVT session sau)

Hưng tắt máy 18:00 ngày 2026-05-25. Sprint 1 đang giữa, 4/8 tasks done. Em pickup B-CPVT-006 tiếp theo, hoặc nếu Hưng muốn nhảy sang Phase 4 OCR thì Sprint 2.

Tránh:
- Đừng làm B-OCRP-* (OCRP own)
- Đừng touch v1.0 export files (giữ rollback)
- Đừng chạy `prisma migrate dev` (sẽ reset DB) — dùng `prisma migrate diff | psql -1 -f`

Good luck!
