# Sửa lỗi chặn bàn giao — hệ thống Vật tư

*Prompt cho session **"Code vật tư"** · soạn 17/08/2026 bởi session kiểm thử*

## 1. BỐI CẢNH

Workspace ĐÚNG: `/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/VẬT TƯ`
Remote `toanduc1993-cmd/Commerce.git` · nhánh `main` · đang có **2 commit chưa push**.
⛔ Bản cũ ở `~/Desktop/IBSHI/01 IBSHI THƯƠNG MẠI/.../VẬT TƯ` là bản chụp tháng 4 — KHÔNG đụng.

Hệ thống sắp bàn giao cho **20 người dùng qua LAN**, và trước đó sẽ có **12 người kiểm thử đồng thời
trên toàn bộ tính năng**. Một phiên kiểm thử đã chạy ngày 17/08 và kết luận **CHƯA BÀN GIAO ĐƯỢC**.

**Đọc trước khi làm bất cứ việc gì:** `docs/VAN-DE-CAN-SUA-TRUOC-BAN-GIAO.md`.
Tài liệu đó mô tả đầy đủ từng lỗi kèm `file:dòng`, bằng chứng đo được, và đề xuất hướng sửa.
Prompt này chỉ nói **cách làm việc**, không lặp lại nội dung lỗi.

## 2. MỤC TIÊU

Sửa xong 4 việc mức 0 (chặn bàn giao) và 4 việc mức 1 (cao), để phiên kiểm thử chạy lại được
phần L→O của `deploy/uat/UAT_CHECKLIST.md`.

## 3. ⚠️ PHÂN CHIA QUYỀN SỬA FILE — ĐỌC KỸ

Có **hai phiên chạy song song**. Sửa nhầm vùng của nhau là xung đột.

| Vùng | Ai sửa |
| --- | --- |
| `backend/src/**`, `frontend/src/**`, `backend/prisma/**`, `backend/scripts/**` | ✅ **Phiên này (Code vật tư)** |
| `deploy/uat/**`, `deploy/PRE_GOLIVE_CHECKLIST.md` | ❌ phiên kiểm thử — KHÔNG đụng |
| `docs/VAN-DE-CAN-SUA-TRUOC-BAN-GIAO.md`, `docs/PROMPT-*.md` | ❌ phiên kiểm thử — KHÔNG đụng |
| `CHANGES_LOG.md` | ⚠️ dùng chung — xem dưới |
| `DEVOPS_NOTES.md` | ✅ phiên này, khi phát sinh luật mới |

**Về `CHANGES_LOG.md`:** file này **đang có thay đổi CHƯA COMMIT** — mục `2026-08-17` do phiên kiểm
thử ghi. **Đừng ghi đè, đừng `git checkout` nó.** Thêm mục mới của mình vào bên dưới mục đó trong
cùng khối `## 2026-08-17`. Nếu thấy nội dung lạ thì đó là phiên kia vừa ghi — giữ nguyên.

Cũng đang chưa commit: `deploy/uat/UAT_CHECKLIST.md`. Đừng đụng.

## 4. NGUYÊN TẮC CỨNG

- 🚫 KHÔNG `git push` (RULE CỨNG #0). Commit chỉ khi anh Hưng bảo.
- 🚫 KHÔNG `prisma migrate dev` (RULE CỨNG #6 — reset CSDL, mất 3.465 chi tiết hợp đồng, 4.440 vật tư,
  1.979 dòng yêu cầu mua). Đổi schema thì dùng `prisma migrate diff` rồi áp bằng `psql`, và **đọc kỹ
  file SQL sinh ra, bỏ tay mọi câu `DROP TABLE` đụng bảng `_backup_*`** (luật R-16).
- 🚫 KHÔNG chạy máy chủ qua Claude harness (RULE CỨNG #4) — anh Hưng mở tab riêng. Backend chạy
  `node src/app.js` **không có `--watch`** nên sửa file phải nhờ anh khởi động lại.
- 🚫 KHÔNG xoá file, chỉ chuyển `_archive/`. KHÔNG xoá bất kỳ bảng `_backup_*` nào trong CSDL.
- 🚫 KHÔNG tự dự kiến thời gian.
- ⚠️ **Dữ liệu đang chạy là dữ liệu THẬT.** Mốc: PurchaseOrder 0 · ContractDetail 3.465 ·
  dòng đã duyệt 522 · Material 4.440 · Vendor 189. Trước mọi thao tác có ghi: chụp ảnh nguyên trạng
  và soạn sẵn script khôi phục. Nút "Tạo PO / HĐ" tạo đơn hàng THẬT và khoá gói.
- ⚠️ **Luật R-18 — kiểm bằng MỘT trình duyệt là chưa đủ.** Ngày 14/08 có lỗi làm mọi thao tác ghi
  trên Chrome trả 403 trong khi Safari vẫn chạy, ẩn suốt 2,5 tháng. Sửa xong phải thử **cả Chrome
  và Safari**.
- ⚠️ **Luật R-17 — code chưa chạy lần nào = code chưa tồn tại.** Endpoint viết xong mà giao diện chưa
  gọi thì phải gọi thử bằng curl trước khi coi là xong. Kiểm "thiếu thẻ → 403" là chưa đủ, phải có
  thêm **một lệnh ghi THÀNH CÔNG** mới đủ cặp.
- ❓ Hai nguồn số liệu vênh nhau → HỎI, không tự chọn bên nào.
- 📖 Viết tắt giải thích lần đầu.

## 5. BA QUYẾT ĐỊNH CẦN ANH HƯNG CHỐT TRƯỚC KHI CODE

Đừng đoán ba thứ này — sai là phải làm lại từ đầu.

1. **Bảng phân vai (cho BG-01).** Trong 6 vai trò `MUA_HANG · KY_THUAT · QC · WAREHOUSE · BOD · ADMIN`,
   ai được: duyệt nhà cung cấp · tạo đơn hàng · xoá đợt báo giá · nhập Excel yêu cầu mua · ghi nhận
   hàng về · xác nhận QC · sửa danh mục vật tư và nhà cung cấp? Trình bảng đề xuất để anh sửa rồi duyệt.
2. **Phạm vi `X` mà vẫn có đơn giá thì tính là gì (cho C-02)?** Có 32 báo giá như vậy. Ba nơi trong hệ
   thống đang hiểu khác nhau. Chốt một quy tắc rồi áp cho cả ba.
3. **Chạy HTTPS hay chế độ phát triển (cho BG-04)?** Ảnh hưởng thẳng tới cách sửa.

## 6. THỨ TỰ LÀM

Làm theo mức, không nhảy cóc. Xong mỗi việc thì ghi `CHANGES_LOG.md` ngay, đừng dồn.

**Mức 0 — chặn bàn giao:**
1. **BG-03** — mã đơn hàng đụng nhau khi nhiều người bấm cùng lúc. Làm trước vì độc lập, không cần
   anh Hưng chốt gì, và **chắc chắn phát nổ khi 12 người kiểm đồng thời**.
2. **BG-01** — phân quyền 41 route ghi dữ liệu. Sau khi có bảng phân vai. Việc nặng nhất.
   Nhớ cả hai vế: chặn ở máy chủ **và** ẩn nút ở giao diện.
3. **BG-02** — script tạo tài khoản hàng loạt (gấp, cần cho 12 người kiểm), rồi màn hình quản trị
   người dùng (trước khi bàn giao thật).
4. **BG-04** — theo quyết định về HTTPS. Kèm báo lỗi rõ lúc khởi động nếu `NODE_ENV=production`
   mà không có HTTPS.

**Mức 1 — cao:**
5. **C-01** thẻ tổng NCC hiện 0 ₫ · **C-03** rời chế độ PER_BID không dọn — hai việc nhỏ, gọn.
6. **C-02** quy tắc phạm vi `X` — sau khi anh Hưng chốt.
7. **C-04** chống ghi đè khi nhiều người sửa cùng chỗ — cần cho 12 người kiểm đồng thời.

**Mức 2** để sau khi bàn giao, trừ **TB-04** (nới giới hạn tải file cho đợt kiểm) nên làm sớm.

## 7. NGHIỆM THU

- [ ] Mỗi việc sửa có một mục `CHANGES_LOG.md` riêng, đủ 5 phần: What · Files (kèm `file:dòng`) ·
      Verify (lệnh chạy được) · Rollback.
- [ ] Mỗi việc có **bằng chứng chạy thật**, không phải "đã sửa xong": mã HTTP, kết quả truy vấn,
      hoặc nguyên văn chuỗi trên màn hình.
- [ ] Việc nào chạm lệnh ghi đều thử trên **cả Chrome và Safari** (R-18).
- [ ] `cd backend && npm test` → **20/20**.
- [ ] `cd frontend && npx tsc --noEmit` → **0 lỗi** (hiện đang sạch, đừng làm bẩn lại).
- [ ] Mốc dữ liệu sau khi sửa: PurchaseOrder 0 · ContractDetail 3.465 · dòng đã duyệt 522 —
      lệch thì giải thích được từng dòng.
- [ ] Không đụng vào `deploy/uat/**` và `docs/VAN-DE-*` / `docs/PROMPT-*`.
- [ ] **Chưa push.**

## 8. ĐẦU RA

1. Code đã sửa, chạy được, có bằng chứng.
2. Các mục mới trong `CHANGES_LOG.md`.
3. Luật mới trong `DEVOPS_NOTES.md` nếu phát sinh (luật cuối hiện tại là R-18).
4. Báo lại cho anh Hưng: việc nào xong, việc nào còn, việc nào cần anh quyết thêm.
5. Nhắn phiên kiểm thử biết đã sửa xong những gì để chạy lại phần L→O.
