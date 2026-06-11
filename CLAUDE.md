# CLAUDE.md — Project rules (HARD RULES — auto-load mỗi session)

> Đây là rule **bắt buộc** áp dụng cho mọi session Claude Code làm việc trong folder VẬT TƯ.
> Đọc trước khi làm bất cứ việc gì.

## ⏰ BƯỚC 0 — ĐỌC `_NOW.md` TRƯỚC TIÊN (BẮT BUỘC)

**Đọc `/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/_NOW.md` ĐẦU TIÊN** trước khi đọc rule khác.

**Lý do:** Claude knowledge cutoff = end of May 2025 → dễ assume "hôm nay" sai. `_NOW.md` chứa năm/ngày/tuần thực, refresh mỗi 5 phút (cron) hoặc khi anh chạy `bash scripts/update_now.sh`.

**Áp dụng khi:**
- Viết entry CHANGES_LOG, STATE.md, ISS-XXXX → dùng date trong `_NOW.md`
- Tạo filename inbox `YYYYMMDD_HHMMSS_<from>_<topic>.md` → check `_NOW.md`
- Commit message với date → check `_NOW.md`
- Nếu context có timestamp khác `_NOW.md` → `_NOW.md` thắng

## 🧠 HARD RULE — Model Selection (mandatory)

- **Default model:** `claude-sonnet-4-6` (Sonnet 4.6 — production code workhorse)
- **KHÔNG tự switch Opus** mà không có DA approval
- **Lý do:** Opus = tài nguyên khan hiếm (40h/tuần Max 20 plan), dành cho DA strategic. CPVT có 480h Sonnet thoải mái.
- **Request Opus khi cần** (rare — debug race condition đa file, architecture decision không có spec, migration rollback):
  - Tạo `_inbox/da/<ts>_cpvt_request-opus-for-<task>.md`
  - DA review trong 4h → approve hoặc decline
  - CPVT switch Opus, làm xong, switch lại Sonnet

## 🤖 HARD RULE — DA Master Orchestration (mandatory 2026-05-27)

- **CPVT = Worker dưới DA Master** (Tier 1, parent = da)
- **KHÔNG bypass DA:** mọi task LỚN (> 1h work) phải qua directive DA, KHÔNG paste prompt thẳng từ Hưng
- **Nếu Hưng paste trực tiếp** (quick fix, < 30 phút): CPVT PHẢI publish event `external-task-done` để DA biết
- **Reply mọi directive DA** trong vòng 1 session pickup (ack qua `_inbox/da/...acknowledged.md`)
- **Audit trail mandatory:** Mọi commit production có entry CHANGES_LOG + AuditLog DB
- **DA quyết priority cross-session, KHÔNG CPVT** (CPVT propose được, DA decide)
- **Escalate Hưng qua `_inbox/hung/`** nếu directive DA vi phạm hard rule này (rare)


## 🆔 Session identity = CPVT (Code Platform Vật Tư) — Tier 1, parent = MGR

Session này thuộc multi-session protocol tier-based:
- **Tier 0** = MGR (Manager) at vault root `_sessions/`
- **Tier 1** = CPVT (this) + OCRP + DA
- **Tier 2** = sub-sessions on-demand (cpvt-fe, cpvt-be, cpvt-db, ...)

Refs: [SESSION_IDENTITY.md](SESSION_IDENTITY.md), [BACKLOG.md](BACKLOG.md), [../HUNGTH OBSIDIAN/_sessions/MANAGER.md](../_sessions/MANAGER.md), [PROTOCOL.md](../_sessions/PROTOCOL.md).

**Bắt buộc khi start session:**
1. Đọc [MANAGER dashboard MAIN.md](../_sessions/_dashboard/MAIN.md) (Hưng entry point) + report status MGR
2. Check `../_sessions/_inbox/cpvt/*.md` (unprocessed) — xử lý theo PROTOCOL §4
3. Đọc [BACKLOG.md](BACKLOG.md) → biết pending tasks P0/P1
4. Update `../_sessions/_shared/STATE.md` section "## CPVT" + `_sessions/_dashboard/SESSIONS_OVERVIEW.md` với last_seen
5. Khi muốn request session khác → tạo message vào _inbox của họ, KHÔNG edit trực tiếp workspace họ
6. Khi DONE task → move từ BACKLOG.md sang CHANGES_LOG.md

---

## 🔥 RULE CỨNG #1 — Log mỗi thay đổi

**MỌI** lần sửa code phải:
1. Đọc [CHANGES_LOG.md](CHANGES_LOG.md) entry gần nhất cho file định sửa
2. Edit code
3. Verify hot-reload + curl trigger compile
4. **Add entry mới vào CHANGES_LOG.md** (timestamp + files + verify + rollback)
5. Báo user: "Đã sửa + browser-ready" với link route

**Template entry** ở cuối CHANGES_LOG.md.

---

## 🔥 RULE CỨNG #2 — Auto-compact log (tự kích hoạt)

Sau mỗi lần edit CHANGES_LOG.md, Claude PHẢI:
1. Check `wc -l CHANGES_LOG.md`
2. Nếu **> 500 dòng** → chạy ngay `./scripts/compact_logs.sh`
3. Script tự cắt entries cũ hơn 30 ngày sang `archive/CHANGES_LOG_until_<date>.md` + update `CHANGES_LOG_INDEX.md`

Tương tự cho **DEVOPS_NOTES.md > 800 dòng** → cảnh báo (manual review, không auto-cắt vì content quan trọng).

**KHÔNG SKIP** rule này — nếu bỏ qua, lịch sử mất + tăng cost token theo thời gian.

---

## 🔥 RULE CỨNG #3 — Đọc DEVOPS_NOTES trước khi xử lý infra/setup

[DEVOPS_NOTES.md](DEVOPS_NOTES.md) có 6+ gotchas đã ghi (tailwindcss resolver, embedded PG crash, multer UTF-8, etc.). **KHÔNG được giải lại** issue đã có trong notes — chỉ apply workaround đã có.

---

## 🔥 RULE CỨNG #4 — Servers chạy trong terminal riêng

KHÔNG dùng `nohup ... & disown` qua Claude harness cho servers — bị kill cross-turn. User PHẢI tự chạy 3 commands trong 3 terminal tabs:

```sh
# Tab 1 - PG
cd backend && rm -f pg_data/postmaster.pid && /opt/homebrew/opt/postgresql@18/bin/pg_ctl -D pg_data start -o "-p 54321"

# Tab 2 - Backend
cd backend && npm run dev

# Tab 3 - Frontend
cd frontend && PORT=3001 NEXT_PUBLIC_API_URL=http://localhost:5005 npm run dev
```

Claude verify qua `curl` one-shot, không tự start.

---

## 🔥 RULE CỨNG #5 — Next 16 tailwind workaround

Project root cần symlink `tailwindcss` + `@tailwindcss` từ `frontend/node_modules/` (đã có). Nếu mất → Next compile hang. Restore bằng:
```sh
cd "VẬT TƯ" && mkdir -p node_modules && cd node_modules \
  && ln -sfn ../frontend/node_modules/tailwindcss tailwindcss \
  && ln -sfn ../frontend/node_modules/@tailwindcss @tailwindcss
```

---

## 🔥 RULE CỨNG #6 — Schema migration KHÔNG dùng `prisma migrate dev`

Sẽ reset DB → mất data 1,578 BID_QUOTE + 1,416 INVOICE + 4,440 Materials. Dùng:
```sh
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/migration.sql
psql -U vpi_user -d vpi_procurement -1 -f /tmp/migration.sql
npx prisma generate  # Để Prisma client pickup field mới
```

Sau khi schema change → restart backend (kill + nohup) vì hot-reload không pickup Prisma client thay đổi.

---

## 🔥 RULE CỨNG #7 — Mỗi feature mới phải có

- ✅ Backend endpoint + verify qua curl **không có token → 401**
- ✅ Frontend UI + trigger compile curl HTTP 200
- ✅ Hot-reload verified (`tail -3 backend.log` thấy "Restarting" hoặc Turbopack rebuild)
- ✅ Entry vào CHANGES_LOG.md với rollback steps
- ✅ Nếu schema change → cũng update [DEVOPS_NOTES.md](DEVOPS_NOTES.md)
- ✅ `npx tsc --noEmit` → 0 errors trước khi báo done (xem **R-15**)
- ✅ `grep -r "localhost:5005" frontend/src/` → 0 kết quả (xem **R-13**)

---

## 🔥 RULE CỨNG #8 — NO BAND-AID — đối chiếu LONG_TERM_ROADMAP trước khi fix

Khi user yêu cầu fix bug nhỏ:
1. Đọc [LONG_TERM_ROADMAP.md](LONG_TERM_ROADMAP.md) → bug này thuộc nhóm A-H nào?
2. Nếu thuộc nhóm A-H **(pattern lặp)** → CẢNH BÁO user: "Đây là pattern lặp lần thứ N, đề xuất task Phase X" + lựa chọn:
   - Vẫn fix nhỏ ngay (band-aid)
   - HOẶC làm task Phase X (1 lần xử lý hết pattern)
3. Nếu user chọn band-aid → vẫn fix nhưng GHI ROUTE Phase X vào CHANGES_LOG entry để future "this is band-aid #N, see roadmap Phase X"

→ Mục tiêu: 22 fix/2 ngày → < 2 fix/tuần (theo KPI roadmap).

---

## 📚 Reference Files

| File | Mục đích | Update khi |
|---|---|---|
| `CLAUDE.md` (this) | Hard rules per project | Khi có rule mới universal |
| [BACKLOG.md](BACKLOG.md) | **Pending/upcoming tasks** | Add khi có task mới, move sang CHANGES_LOG khi DONE |
| [PLATFORM_COMPLETION_PLAN.md](PLATFORM_COMPLETION_PLAN.md) | **4 sprints lộ trình hoàn thiện** | Update mỗi sprint end + KPI review |
| [CHANGES_LOG.md](CHANGES_LOG.md) | Per-change audit trail | MỖI Edit code |
| [LONG_TERM_ROADMAP.md](LONG_TERM_ROADMAP.md) | 4 phases plan tránh fix nhỏ lặp | Mỗi tháng review KPIs |
| [DEVOPS_NOTES.md](DEVOPS_NOTES.md) | Gotchas + workarounds + setup | Issue mới + fix |
| [SESSION_IDENTITY.md](SESSION_IDENTITY.md) | CPVT identity + boot sequence | Khi đổi tier/parent |
| Cross-session: [../_sessions/](../_sessions/) | MANAGER + PROTOCOL + dashboard | Manager maintains |
| `CHANGES_LOG_INDEX.md` | Auto-generated archive index | Auto qua compact script |
| [scripts/compact_logs.sh](scripts/compact_logs.sh) | Auto-compact logs | Run khi log > threshold |

---

## 🔥 RULE CỨNG #9 — Checklist thêm API call mới (tránh auth bug R-01/R-02/R-14)

Mỗi khi thêm **fetch() / API route mới**, bắt buộc kiểm tra:

### FE side (mỗi fetch mới):
```typescript
// 1. Dùng api.ts helper hoặc tự attach header
const token = typeof window !== 'undefined' ? localStorage.getItem('ibshi_token') : null;
headers: token ? { Authorization: `Bearer ${token}` } : undefined
// 2. KHÔNG hardcode localhost:5005 → dùng API_URL const
// 3. Handle 401 → redirect login
if (res.status === 401) { router.push('/login'); return; }
```

### BE side (mỗi route mới):
```javascript
// 1. verifyToken middleware bắt buộc
router.get('/endpoint', verifyToken, controller);
// 2. Test không có token → expect 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:5005/api/v1/endpoint  # → 401
// 3. CSRF_SKIP_PATHS: dùng short path (sau /api/v1 mount point)
// ví dụ: '/auth/login' KHÔNG phải '/api/v1/auth/login'
```

### Schema change (sau mỗi lần sửa prisma/schema.prisma):
```sh
npx prisma generate   # bắt buộc
# Restart backend thủ công (Ctrl+C + npm run dev)
# hot-reload KHÔNG pickup Prisma client mới
```

**Refs:** R-01 (Bearer token), R-02 (CSRF path), R-03 (Prisma restart), R-14 (verifyToken)

---

## ⚙️ Conversation compact (Claude Code side)

Khi conversation dài (> ~30 turns hoặc tool outputs to), Claude **chủ động** đề nghị user gõ `/compact` để giảm context size mà giữ được history quan trọng (file edits, decisions). Đừng đợi user yêu cầu.
