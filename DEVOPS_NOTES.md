# DEVOPS_NOTES.md — Sổ tay vận hành dev local

> **Mục đích:** Ghi lại tất cả workaround, fix bug, decision đã thử để **không lặp lại sai lầm**.
> **Update:** mỗi khi gặp issue mới + fix → ghi vào đây.
> **Cross-ref:** [CHANGES_LOG.md](CHANGES_LOG.md) — chronological log mỗi lần sửa (per-file, rollback steps). DEVOPS_NOTES = gotchas + howto, CHANGES_LOG = audit trail.

## ⚙️ Workflow Claude (BẮT BUỘC — RULE CỨNG, xem [CLAUDE.md](CLAUDE.md))

1. **Trước sửa:** đọc CHANGES_LOG.md (entry gần đây cho file đó) + section liên quan trong file này
2. **Sửa code:** Edit
3. **Verify hot-reload:** `tail -3 /tmp/vattu-logs/backend.log` thấy "Restarting" (backend) / curl route compile thành công (frontend)
4. **Trigger compile + test:** `curl -m 30 -o /dev/null -w "%{http_code}\n" http://localhost:3001/<route>` → đảm bảo 200, không error frontend log
5. **Add entry CHANGES_LOG.md** (template ở cuối file đó)
6. **AUTO-COMPACT check:** sau khi add entry → `wc -l CHANGES_LOG.md` → nếu >500 → chạy `./scripts/compact_logs.sh` ngay
7. **Báo user:** "Đã sửa + browser-ready, F5 để check" với link route
8. Nếu schema/infra change → update DEVOPS_NOTES.md section liên quan

## 🤖 Auto-compact (launchd)

LaunchAgent `~/Library/LaunchAgents/com.ibshi.vattu.compactlogs.plist` chạy `scripts/compact_logs.sh` mỗi **Chủ nhật 02:00**. Output `/tmp/vattu-compact-logs.log`.

Manual: `launchctl start com.ibshi.vattu.compactlogs` hoặc `bash scripts/compact_logs.sh`.

---

## 1. Kiến trúc dev local (3 services)

> **S4-1 update 2026-05-28:** Backend KHÔNG còn auto-start PG qua `embedded-postgres` BETA.
> Dùng Homebrew postgres@18 (default) hoặc docker-compose.dev.yml. Xem § 2.5.2 cho lý do.

### 1a. Default — Homebrew PG (recommended cho dev macOS)

| Service | Port | Start command | Stop |
|---|---:|---|---|
| **PostgreSQL 18 (Homebrew)** | 54321 | `cd backend && npm run db:start` | `npm run db:stop` |
| **Backend (Express)** | 5005 | `cd backend && npm run dev` | Ctrl+C |
| **Frontend (Next 16)** | 3001 | `cd frontend && PORT=3001 NEXT_PUBLIC_API_URL=http://localhost:5005 npm run dev` | Ctrl+C |

`npm run db:start` = `rm -f pg_data/postmaster.pid && /opt/homebrew/opt/postgresql@18/bin/pg_ctl -D pg_data start -o '-p 54321'`

### 1b. Alternative — Docker compose

```sh
docker compose -f docker-compose.dev.yml up postgres -d   # chỉ PG
docker compose -f docker-compose.dev.yml up               # cả 3 services
docker compose -f docker-compose.dev.yml down             # stop
```

DB volume `pg_data` (docker named volume, KHÁC với `./pg_data/` của Homebrew). Migration data giữa 2 môi trường:
```sh
# Export từ Homebrew PG → docker
PGPASSWORD='VpiProcurement2026!' pg_dumpall -U vpi_user -h 127.0.0.1 -p 54321 > /tmp/all.sql
docker compose -f docker-compose.dev.yml up postgres -d
docker compose -f docker-compose.dev.yml exec -T postgres psql -U vpi_user -d postgres < /tmp/all.sql
```

**Lưu ý CỰC QUAN TRỌNG:**
- 3 services phải chạy trong **3 terminal tab riêng** (Homebrew path) — KHÔNG được close, KHÔNG Ctrl+C
- Background process qua `nohup` hoặc Claude Code bg task sẽ bị kill khi shell parent end → KHÔNG đáng tin cậy
- Browser luôn dùng `http://localhost:3001` (không phải LAN IP `192.168.0.126`)
- Backend không còn tự start PG — nếu DB down, backend trả 503 + log instruction

---

## 2. Issue đã gặp + workaround đã áp dụng

### 2.1 ❌ `tailwindcss` resolve fail (Next 16 Turbopack)

**Triệu chứng:**
```
Error: Can't resolve 'tailwindcss' in '/Users/.../VẬT TƯ'
  /Users/.../VẬT TƯ/node_modules doesn't exist or is not a directory
  /Users/.../HUNGTH OBSIDIAN/node_modules doesn't exist or is not a directory
  ...
```

Frontend "✓ Ready" nhưng curl timeout — compile hang.

**Root cause:**
Next 16 Turbopack PostCSS resolver tìm `tailwindcss` từ project parent dir (`VẬT TƯ/`), KHÔNG tìm trong `frontend/node_modules/`. Đây là behavior thay đổi so với Next 15.

**Fix (2026-05-25):** Symlink tailwind packages lên parent `node_modules/`:
```sh
cd "/Users/.../VẬT TƯ"
mkdir -p node_modules
cd node_modules
ln -sfn ../frontend/node_modules/tailwindcss tailwindcss
ln -sfn ../frontend/node_modules/@tailwindcss @tailwindcss
```

Sau đó `rm -rf frontend/.next && npm run dev` lại.

**Verify:** `curl -o /dev/null -w "%{http_code}\n" http://localhost:3001/login` → `200`

**KHÔNG làm:**
- ❌ `npm install tailwindcss` ở project root → cài dup, conflict version
- ❌ Sửa `postcss.config.mjs` thêm `path.resolve(__dirname,'node_modules/tailwindcss')` → Next 16 không respect setting đó
- ❌ Downgrade tailwindcss 4 → 3 → mất hết theme + CSS variables

---

### 2.2 ❌ Embedded PostgreSQL crash on init (`node_modules/embedded-postgres`)

**Triệu chứng:**
```
🔄 Resuming existing database...
The database cluster will be initialized with this locale configuration:
  ...
❌ Fatal error: undefined
TypeError: Cannot read properties of undefined (reading 'includes')
    at start_pg.js:84:17
```

**Root cause:**
`embedded-postgres` npm package version conflict — gọi initdb lại trên data dir đã tồn tại, error.message=undefined nên crash khi check `.includes()`.

**Fix (2026-05-23):** Bypass embedded-postgres lib, dùng homebrew `pg_ctl` trực tiếp trên cùng pg_data:
```sh
cd "VẬT TƯ/backend"
rm -f pg_data/postmaster.pid  # nếu stale
/opt/homebrew/opt/postgresql@18/bin/pg_ctl -D pg_data -l pg_data/server.log start -o "-p 54321"
```

**Lưu ý:** `pg_data/postmaster.pid` thường stale từ previous run (đặc biệt khi pg_data được copy giữa máy). Luôn `rm -f` trước khi start.

---

### 2.3 ❌ Backend auto-start PG via embedded fails silently (RESOLVED via S4-1)

**Đã xử lý 2026-05-28** — xem § 2.5.2. Auto-start logic đã removed. Backend chỉ log warning + để Pool fail giải thích.

---

### 2.4 ❌ Tasks dies giữa Claude turns

**Triệu chứng:** Bg tasks start qua `nohup ... & disown` vẫn die sau khi turn của Claude end.

**Root cause:** Claude Code harness `setpgid()` các child processes, kill nhóm khi turn end.

**Workaround:**
- KHÔNG dùng bg tasks cho long-running servers
- User CHẠY TAY trong terminal riêng (Terminal.app / VS Code terminal tab)
- Claude chỉ verify qua `curl` one-shot khi servers đã chạy

---

### 2.5 ❌ Port 5005 vs 3001 — config inconsistency

**Triệu chứng:** Backend bind port 5005 (chuẩn `.env` PORT=5005) nhưng frontend `.env.development` trỏ `NEXT_PUBLIC_API_URL=http://192.168.0.126:5005` (LAN IP, không localhost).

**Workaround:** Khi start frontend, OVERRIDE env:
```sh
PORT=3001 NEXT_PUBLIC_API_URL=http://localhost:5005 npm run dev
```

Vì sao port 3001? Port 3000 (Next default) đang dùng bởi project khác (CKTECK).

CORS — backend `.env` đã add localhost:3001:
```
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://192.168.0.126:3000,http://192.168.0.126:3001
```

---

## 3. Schema migration log (2026-05-23)

| Field/Model | Action | Lý do |
|---|---|---|
| `Material` model | Added (mới) | OCR `items_master.ndjson` 4,440 items không có target table |
| `ContractDetail.prDetailId` | NOT NULL → NULL | Bid quotes + OCR invoices không link PR sẵn |
| `ContractDetail.dataSource` | Added (default 'MANUAL', existing backfilled 'BID_QUOTE') | Phân biệt BID_QUOTE / INVOICE / MANUAL |
| `ContractDetail.projectCode` | Added | Cross-ref về DA cho OCR invoices |
| `ContractDetail.ocrInvoiceStt` | Added | Truy vết về OCR `invoices_master.ndjson` STT |
| `ContractDetail.ocrScanRef` | Added | Reference về PDF gốc (ma_scan field) |
| `datasource db.url` | Removed from schema.prisma | Prisma 7.6 yêu cầu chuyển sang `prisma.config.ts` |

**Backup pre-migration:** `backend/pg_data/backup_20260523_151255.sql` (1.5MB)

### 2.5.2 ✅ Replace embedded-postgres BETA (S4-1, 2026-05-28)

**Lý do thay đổi:**
- `embedded-postgres@18.3.0-beta.16` là BETA — risk C5 cho stability (xem STABILITY_RISK_REGISTER.md)
- Auto-start logic trong `app.js` chạy `execSync(pg_ctl)` blocking, không cleanup tốt
- Dev đã dùng Homebrew PG (xem § 2.2 workaround), prod dùng docker-compose — embedded-postgres deps không thực sự được dùng

**Đã xoá:**
- Deps: `embedded-postgres` + 4 optionalDependencies `@embedded-postgres/{darwin,linux}-{arm64,x64}` (backend/package.json)
- File: `backend/start_pg.js`
- Code: `ensurePostgres()` + `resolveEmbeddedPgDir()` trong `backend/src/app.js`
- Auto-restart on `DatabaseNotReachable` error (chỉ trả 503 + hint dùng `npm run db:start`)

**Thay bằng:**
- `npm run db:start` → Homebrew `pg_ctl` (recommended dev macOS)
- `npm run db:stop` → Homebrew `pg_ctl stop`
- `npm run db:docker` → docker compose up postgres (alternative)
- Backend listen ngay khi start (không đợi PG), probe connection async + log warning nếu fail

**Verify (sau khi user restart backend):**
```sh
cd "VẬT TƯ/backend"
# 1. Stop hiện tại nếu cần
npm run db:stop || true
# 2. Start lại bằng script mới
npm run db:start
# 3. Verify backend connect được
npm run dev  # nên thấy "PostgreSQL connection OK" trong log
# 4. Verify dữ liệu intact
PGPASSWORD='VpiProcurement2026!' psql -U vpi_user -h 127.0.0.1 -p 54321 vpi_procurement -c "SELECT count(*) FROM \"Project\";"
# expected: 52 (hoặc số hiện tại)
```

**Rollback:**
```sh
cd "VẬT TƯ/backend"
git checkout package.json src/app.js
git restore start_pg.js  # nếu cần dùng lại
npm install
```

---

### 2.5.1 ✅ Prisma migrate folder workflow (S3-5, 2026-05-28)

**State:** DB đã đăng ký với Prisma migrate. 6 migrations đã marked applied:
- `20260406114411_add_pr_detail_fields` (SUPERSEDED, kept for history)
- `20260407000000_init_v3` (baseline — full schema from `migrate diff --from-empty`)
- `20260525000000_s34_add_fk_indexes`
- `20260526000000_b_cpvt_012_vendor_bank_fields`
- `20260526000001_b_cpvt_018_bidcode_v2`
- `20260526000002_f04_alert_resolution`

Verify: `cd backend && npx prisma migrate status` → "Database schema is up to date!"

**Workflow cho schema change mới (KHÔNG dùng `migrate dev` — sẽ reset DB mất data):**

```sh
# 1. Edit prisma/schema.prisma (thêm field, model, index…)
# 2. Generate SQL diff vào folder migrations mới
cd backend
TS=$(date +"%Y%m%d%H%M%S")
NAME="<descriptive_kebab_name>"   # ví dụ: "add_audit_trail_index"
mkdir -p "prisma/migrations/${TS}_${NAME}"
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datasource prisma/schema.prisma \
  --script > "prisma/migrations/${TS}_${NAME}/migration.sql"

# 3. Review SQL trước khi apply (đặc biệt với DROP/ALTER cột)
less "prisma/migrations/${TS}_${NAME}/migration.sql"

# 4. Apply manual qua psql (KHÔNG dùng migrate deploy nếu BETA postgres)
psql "$DATABASE_URL" -1 -f "prisma/migrations/${TS}_${NAME}/migration.sql"

# 5. Mark applied trong _prisma_migrations table
npx prisma migrate resolve --applied "${TS}_${NAME}"

# 6. Regenerate Prisma client để pickup field mới
npx prisma generate

# 7. Restart backend (hot-reload KHÔNG pickup client mới)
```

**Khi migrate diff fail / schema drift:**
- `npx prisma migrate status` để xem migration nào pending
- Nếu DB drift khỏi migrations → fix manual qua psql + `migrate resolve --applied`/`--rolled-back`
- KHÔNG dùng `migrate reset` (mất data)

**Khi cần baseline lại (vd. add migration cho instance staging mới):**
```sh
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > /tmp/init.sql
# Tạo manually folder + apply như trên
```

---

### 2.6 ❌ Multer UTF-8 filename mojibake

**Triệu chứng:** Upload file Excel tên `2026 05 07 Theo dõi dự án 109_Rev D1.xlsx` → DB lưu `Theo dÃµi dá»± Ã¡n` (mojibake).

**Root cause:** `multer` 1.x decode `req.file.originalname` as Latin-1, không phải UTF-8.

**Fix:** Re-encode trong controller:
```js
const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
```

Dùng `originalName` thay vì `req.file.originalname` cho mọi DB write + file save.

---

## 4. Source code fixes (2026-05-25)

| # | File | Fix | Verify |
|---|---|---|---|
| 1 | [backend/src/controllers/poController.js:207-219](backend/src/controllers/poController.js) | (a) Bỏ hardcoded `allContractsDelivered = true`; (b) Fix ternary inversion `? PARTIAL_RECEIVED : FULLY_RECEIVED` → `? FULLY_RECEIVED : PARTIAL_RECEIVED`; (c) Sửa enum `PARTIALLY_RECEIVED` → `PARTIAL_RECEIVED` theo schema | Cần PO test e2e |
| 3 | [frontend/src/app/login/page.tsx](frontend/src/app/login/page.tsx) | Bỏ hint misleading "Nhập 123456"; thay "tự khởi tạo User" → "Liên hệ Quản trị viên"; URL dùng `NEXT_PUBLIC_API_URL` env | curl /login → check placeholder + text ✓ |
| 4 | [backend/src/routes/authRoute.js:10](backend/src/routes/authRoute.js) | Thêm `POST /api/v1/auth/users` (verifyToken + restrictTo('ADMIN')) | curl với ADMIN token |
| 9 | [frontend/src/app/mua-hang/page.tsx](frontend/src/app/mua-hang/page.tsx) | Bỏ MOCK_PRS import (init prs=[] thay vì MOCK); 2 hardcoded `http://localhost:5005` → `${API_URL}` const | curl /mua-hang ✓ HTTP 200 |
| **10** | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) + [backend/src/controllers/bidAnalysisController.js](backend/src/controllers/bidAnalysisController.js) + [backend/src/routes/procurementRoutes.js](backend/src/routes/procurementRoutes.js) + [frontend/src/app/so-sanh-bao-gia/page.tsx](frontend/src/app/so-sanh-bao-gia/page.tsx) + [frontend/src/lib/api.ts](frontend/src/lib/api.ts) | **Feature mới — "Tải file gốc báo giá":** (a) Schema add `BidAnalysis.{sourceFileName, sourceFilePath, sourceSheetName}`; (b) Upload controller save buffer vào `uploads/bid-analyses/<ts>_<name>.xlsx`; (c) Add route `GET /api/v1/bid-analyses/:id/download` (verifyToken) trả file; (d) Frontend nút "Tải file gốc" trong header `/so-sanh-bao-gia` (fetch + blob + auto-download); (e) Show sheet name trong header. Old 81 bids: sourceFile = NULL, button thay bằng text "File gốc không khả dụng" | Tested end-to-end: upload 109_Rev D1.xlsx → 15 bids created, file saved 2.6MB, download HTTP 200 + Content-Disposition UTF-8 ✓ |

---

## 5. Smoke test commands (verify all works)

```sh
# 1. Backend health
curl -s http://localhost:5005/health
# expect: {"status":"ok","db":"connected",...}

# 2. Frontend login page
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/login
# expect: 200

# 3. Verify Fix #3 (login hint changed)
curl -s http://localhost:3001/login | grep -o "Liên hệ Quản trị viên"
# expect: Liên hệ Quản trị viên

# 4. Login as admin (get JWT token)
curl -s -X POST http://localhost:5005/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"hungth","password":"<password>"}'
# expect: {"success":true,"token":"...","user":{...}}

# 5. Test Fix #4 (create user — needs ADMIN token from step 4)
TOKEN="<paste from step 4>"
curl -X POST http://localhost:5005/api/v1/auth/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"Test@123","name":"Test","role":"KY_THUAT"}'
# expect: {"success":true,...}
```

---

## 6. Reference data trong DB (sau migration 2026-05-23)

| Entity | Count | Notes |
|---|---:|---|
| Project | 52 | 5 pilot + 47 OCR mới |
| Vendor | 136 | Dedup từ 124 + 40 OCR (28 merged) |
| Material | 4,440 | Toàn bộ items_master OCR |
| ContractDetail (BID_QUOTE) | 1,578 | Có sẵn từ trước |
| ContractDetail (INVOICE) | 1,416 | OCR invoices, dataSource='INVOICE' |
| PrDetail | 1,351 | Có sẵn |
| BidAnalysis | 81 | Có sẵn |
| User (ADMIN) | 1 | `hungth` |

---

## 7. Files sản phẩm khi work với project

- `02.CONG-CU/ibs-ocr/migrate_ocr_to_vattu.py` — Script migration OCR → VẬT TƯ DB (idempotent)
- `02.CONG-CU/ibs-ocr/data/migration_previews/phase_*.ndjson` — 9 preview files
- `02.CONG-CU/ibs-ocr/STATUS_OCR_20260522.md` — SSOT OCR pipeline
- `VẬT TƯ/backend/pg_data/backup_20260523_151255.sql` — Backup pre-migration
- `VẬT TƯ/DEVOPS_NOTES.md` ← **file này**

---

## 8. Pending issues (chưa fix)

| Priority | Issue | Notes |
|---|---|---|
| 🟠 High | Zero test coverage | Cần Vitest + Supertest 10 smoke tests |
| 🟠 High | JWT trong localStorage (XSS) | Switch HttpOnly cookie + CSRF |
| 🟡 Medium | Phase 4 OCR chứng chỉ MTR/CO/CQ | Cần Gemini SDK + Certificate model |
| 🟡 Medium | Input validation framework | Add Zod middleware |
| 🟡 Medium | Structured logging | Switch console.log → Pino |
| 🟢 Low | Audit log retention policy | Cron job xóa log > 90 ngày |

---

## 9. Lịch sử update

| Date | Change | Author |
|---|---|---|
| 2026-05-23 | OCR migration (5 phases) + schema mod (Material + ContractDetail.dataSource) | Claude session |
| 2026-05-25 | Fix #1/#3/#4/#9 + tailwind symlink workaround + DEVOPS_NOTES tạo mới | Claude session |
