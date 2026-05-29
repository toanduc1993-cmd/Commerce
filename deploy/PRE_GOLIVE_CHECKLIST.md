# Pre Go-Live Checklist — IBS Procurement

Chạy 100% checklist này trước khi bấm deploy production.
Mỗi mục cần 1 người verify và ghi tên.

---

## 🛡️ 1. Security

| #    | Mục                                                              | OK  | Verified by |
| ---- | ---------------------------------------------------------------- | --- | ----------- |
| S1   | `backend/.env` production có `JWT_SECRET` mới (64 byte hex)       | ☐   |             |
| S2   | JWT_SECRET **KHÁC** dev environment                               | ☐   |             |
| S3   | `POSTGRES_PASSWORD` production mạnh (32+ ký tự random)            | ☐   |             |
| S4   | `ALLOWED_ORIGINS` chỉ chứa domain thật, KHÔNG có `localhost`      | ☐   |             |
| S5   | `NODE_ENV=production` trong `.env`                                | ☐   |             |
| S6   | `TRUST_PROXY=1` để rate limit đọc đúng X-Forwarded-For           | ☐   |             |
| S7   | SSL cert valid, khớp domain (`openssl s_client`)                  | ☐   |             |
| S8   | `.env` KHÔNG bị commit lên git (`git ls-files .env`)              | ☐   |             |
| S9   | Password admin (`hungth`/others) đã đổi khỏi `123456`             | ☐   |             |
| S10  | Đã tạo ít nhất 1 tài khoản admin backup                            | ☐   |             |
| S11  | Firewall server chỉ mở 80/443 ra ngoài, 22 cho SSH                | ☐   |             |
| S12  | PostgreSQL KHÔNG expose port 5432 ra host (chỉ docker network)    | ☐   |             |

## 📦 2. Code quality

| #    | Mục                                                   | OK  | Verified by |
| ---- | ----------------------------------------------------- | --- | ----------- |
| C1   | Frontend `npm run build` — 0 error                    | ☐   |             |
| C2   | Frontend `npm run lint` — 0 error (warnings OK)       | ☐   |             |
| C3   | Frontend `npx tsc --noEmit` — clean                    | ☐   |             |
| C4   | Backend load all routes/controllers — no require error | ☐   |             |
| C5   | Backend smoke test: `./deploy/uat/smoke_test.sh` PASS | ☐   |             |
| C6   | Không có `console.log` leftover trong frontend        | ☐   |             |
| C7   | Không có file `.test.ts`/scratch trong `src/`         | ☐   |             |

## 🐳 3. Docker build

| #    | Mục                                             | OK  | Verified by |
| ---- | ----------------------------------------------- | --- | ----------- |
| D1   | `docker compose config` không lỗi syntax        | ☐   |             |
| D2   | `docker compose build backend` → image OK       | ☐   |             |
| D3   | `docker compose build frontend` → image OK      | ☐   |             |
| D4   | Image size hợp lý (backend < 500MB, frontend < 300MB) | ☐   |             |
| D5   | `docker compose up -d` → 4 container healthy    | ☐   |             |
| D6   | `docker compose logs` không có lỗi bất thường   | ☐   |             |

## 🗃️ 4. Database

| #    | Mục                                                   | OK  | Verified by |
| ---- | ----------------------------------------------------- | --- | ----------- |
| DB1  | `npx prisma migrate deploy` — schema lên đủ            | ☐   |             |
| DB2  | `node run_seed.js` — tạo admin đầu tiên                | ☐   |             |
| DB3  | Đã backup DB dev trước khi deploy                     | ☐   |             |
| DB4  | pg_dump lệnh test — chạy được                         | ☐   |             |
| DB5  | Restore test — verify pg_dump có thể restore lại       | ☐   |             |
| DB6  | Volume `pg_data` mount đúng path persistent            | ☐   |             |

## 🌐 5. Nginx & DNS

| #    | Mục                                                 | OK  | Verified by |
| ---- | --------------------------------------------------- | --- | ----------- |
| N1   | DNS record trỏ đúng IP server                       | ☐   |             |
| N2   | `curl -k https://domain/health` → `{"status":"ok"}` | ☐   |             |
| N3   | HTTP → HTTPS redirect hoạt động                     | ☐   |             |
| N4   | Upload file 5MB hoạt động (không bị 413)            | ☐   |             |
| N5   | Login page load được, CSS hiển thị đúng             | ☐   |             |
| N6   | SSL Labs test (tùy chọn) ≥ A grade                   | ☐   |             |

## 📊 6. Data validation

| #    | Mục                                                      | OK  | Verified by |
| ---- | -------------------------------------------------------- | --- | ----------- |
| V1   | Dashboard hiển thị đúng số projects/PRs/contracts         | ☐   |             |
| V2   | Total contract value = sum(contracts totalNoVAT) ✓         | ☐   |             |
| V3   | Top 5 vendors hiển thị đúng                              | ☐   |             |
| V4   | Cross-check 1 HĐ bất kỳ: Excel gốc vs database           | ☐   |             |
| V5   | Cross-check 1 bid analysis: Excel vs database            | ☐   |             |

## 👥 7. User & Training

| #    | Mục                                                  | OK  | Verified by |
| ---- | ---------------------------------------------------- | --- | ----------- |
| U1   | Đã tạo tài khoản cho tất cả user cần truy cập        | ☐   |             |
| U2   | User đã được training luồng UAT scenarios            | ☐   |             |
| U3   | Phòng TM đã ký PASS UAT                               | ☐   |             |
| U4   | Phòng Kỹ thuật đã ký PASS UAT                        | ☐   |             |
| U5   | Có tài liệu HDSD hoặc video hướng dẫn cho user mới  | ☐   |             |
| U6   | Có hotline IT / người support trong tuần go-live     | ☐   |             |

## 🔄 8. Rollback plan

| #    | Mục                                                | OK  | Verified by |
| ---- | -------------------------------------------------- | --- | ----------- |
| R1   | Biết cách dừng stack: `docker compose down`         | ☐   |             |
| R2   | Biết cách restore DB từ backup                      | ☐   |             |
| R3   | Biết cách rollback git về tag trước                 | ☐   |             |
| R4   | Biết cách clear rate-limit (restart backend)        | ☐   |             |
| R5   | Có contact của dev để hỗ trợ emergency              | ☐   |             |

## 📝 9. Documentation

| #    | Mục                                               | OK  | Verified by |
| ---- | ------------------------------------------------- | --- | ----------- |
| DOC1 | `deploy/README.md` — deploy guide đầy đủ           | ☐   |             |
| DOC2 | `deploy/uat/UAT_CHECKLIST.md` — đã điền kết quả   | ☐   |             |
| DOC3 | `deploy/uat/UAT_SCENARIOS.md` — sign-off           | ☐   |             |
| DOC4 | `HANDOVER_REPORT.md` — cập nhật milestone cuối    | ☐   |             |
| DOC5 | Người dùng biết URL production + tài khoản login  | ☐   |             |

---

## 🚦 Go/No-Go Decision

**Điều kiện go-live:**

- ✅ 100% mục trong Section 1 (Security)
- ✅ 100% mục trong Section 2 (Code quality)
- ✅ Section 3-5: OK
- ✅ Section 6: ít nhất V1, V2, V3, V4 pass
- ✅ Section 7: U3, U4, U6 pass
- ✅ Section 8: R1, R2, R5 pass

**Quyết định:**

☐ **GO** — Deploy production ngay
☐ **NO-GO** — Fix các mục fail, test lại

**Người quyết định:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  **Ngày:** \_\_\_\_\_\_\_\_\_\_

---

## Lịch deploy dự kiến

- **T-1 (1 ngày trước):** Backup DB dev, freeze code, chạy full checklist
- **T-0 ngày deploy:**
  - 08:00 — Họp team, confirm go-live
  - 09:00 — Pull code lên server, `docker compose build`
  - 09:30 — `docker compose up -d` + migrate + seed
  - 10:00 — Smoke test trên production URL
  - 10:30 — Training live cho user
  - 11:00 — User bắt đầu sử dụng
  - 17:00 — Kiểm tra log cuối ngày, note issue
- **T+1:** Monitor log, fix bug phát hiện trong ngày đầu
- **T+7:** Retrospective, đánh giá stability
