# UAT Scenarios — Kịch bản kiểm thử theo quy trình nghiệp vụ

Mỗi scenario mô phỏng 1 luồng công việc thực tế. Tester đóng vai user theo role và chạy từ đầu đến cuối, ghi lại issue phát hiện được.

---

## 🎬 Scenario 1 — "Thêm NCC mới + tạo HĐ mô phỏng"

**Role:** Nhân viên phòng Thương Mại
**Mục tiêu:** Thêm 1 NCC chưa có trong hệ thống, kiểm tra xuất hiện đúng ở các module khác.

**Steps:**

1. Login → `/vendors`
2. Bấm **"Thêm NCC"**
3. Nhập:
   - Tên: `CÔNG TY TNHH TEST UAT`
   - MST: `0100000000`
   - Địa chỉ: `123 Test Street, Hà Nội`
   - Người liên hệ: `Nguyễn Văn A — 0900000000`
   - Loại: `Trong nước`
   - Status: `Active`
4. Bấm **"Tạo mới"** → kiểm tra NCC xuất hiện trong list
5. Search "TEST UAT" → confirm filter đúng
6. Click row → Drawer hiện ra, lịch sử HĐ **rỗng**
7. Click icon Edit → thay SĐT thành `0911111111` → Cập nhật
8. Refresh page → giá trị mới vẫn còn
9. Soft delete (icon INACTIVE) → NCC biến khỏi filter ACTIVE
10. Bấm **"Hiện tất cả"** → NCC hiển thị lại với badge INACTIVE
11. Hard delete (icon xoá) → confirm → NCC biến mất hoàn toàn

**Kết quả kỳ vọng:**

- Mọi thao tác CRUD hoạt động
- Toast notification hiện đúng message tiếng Việt
- Không refresh cả trang khi CRUD (SPA behavior)

**Record issue nếu có:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## 🎬 Scenario 2 — "Đánh dấu lô hàng NK về kho + làm QC + bàn giao SX"

**Role:** Nhân viên kho + QC
**Mục tiêu:** Trace 1 lô nhập khẩu từ khi về → QC → bàn giao sản xuất.

**Steps:**

1. Login → `/warehouse`
2. Filter **"Nhập khẩu"** + **"Chờ QC"**
3. Chọn 1 HĐ bất kỳ, note lại:
   - Số HĐ: \_\_\_\_\_\_
   - Vendor: \_\_\_\_\_\_
   - Item code: \_\_\_\_\_\_
4. Click icon `event_available` → đặt ngày hàng về là **hôm nay**
5. Click row để expand → bấm **"Thêm QC"**
6. Nhập form:
   - Số báo cáo: `QC-UAT-001`
   - Ngày: hôm nay
   - SL kiểm: `10`, SL đạt: `10`
   - Kết quả: `Pass`
   - Ghi chú: `Test UAT`
7. Lưu → biên bản xuất hiện trong bảng con
8. Trong dòng, status QC phải chuyển từ **Chờ QC** → **Đạt**
9. KPI card "QC Đạt" tăng lên `+1`
10. Click icon engineering → nhập ngày hôm nay → bàn giao SX
11. Row hiện cột "Bàn giao SX" với ngày hôm nay
12. Bàn giao status card +1
13. **Cleanup:** Click X trong biên bản QC để xoá → status revert về PENDING

**Kết quả kỳ vọng:**

- Toàn bộ workflow 11 bước hoạt động không cần refresh
- Các KPI card cập nhật ngay sau mỗi thao tác
- Không có lỗi console trên browser

**Record issue:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## 🎬 Scenario 3 — "Upload file Excel PR mới cho dự án mới"

**Role:** Nhân viên Kỹ thuật
**Mục tiêu:** Import file Excel PR mới và kiểm tra data xuất hiện đúng.

**Steps:**

1. Login → `/projects` → bấm "Thêm dự án" (nếu có) hoặc dùng project test
2. Vào `/mua-hang`
3. Bấm nút upload → chọn 1 file `.xlsx` từ folder `Excel/Cập nhật 05-03-2026/`
4. Chờ upload hoàn thành → kiểm tra message trả về:
   - Số items matched
   - Số items created
   - Số items updated
5. Vào bảng Master Tracking → thấy các items mới
6. Vào `/hop-dong` → nếu file có hợp đồng, thấy HĐ mới xuất hiện
7. Vào `/dashboard` → tổng giá trị HĐ tăng

**Kết quả kỳ vọng:**

- File < 5MB upload trong < 30 giây
- Không bị lỗi parse (check console)
- Dashboard refresh số liệu sau khi import

**Record issue:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## 🎬 Scenario 4 — "Chọn NCC thắng thầu từ bid analysis"

**Role:** BOD / Trưởng phòng TM
**Mục tiêu:** Review các báo giá và ra quyết định chọn vendor.

**Steps:**

1. Login → `/so-sanh-bao-gia`
2. Sidebar bên trái hiển thị 81 bids
3. Chọn 1 bid bất kỳ từ sidebar
4. Right panel hiện matrix giá × vendor
5. Giá thấp nhất mỗi row được highlight
6. Nhìn footer hiển thị tổng giá trị mỗi vendor
7. Click "Chọn NCC" cho vendor có giá thấp nhất
8. Confirmation → Bid chuyển status **SELECTED**
9. Vendor được chọn hiển thị badge winner (cờ hoặc check icon)
10. Vào `/bao-gia` → bid này có badge "Đã chọn NCC"

**Kết quả kỳ vọng:**

- Matrix load trong < 2 giây
- Logic highlight low-price đúng mỗi row
- Không chọn được 2 vendors cùng lúc (nếu click vendor thứ 2 → confirmation "đổi winner?")

**Record issue:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## 🎬 Scenario 5 — "Đánh dấu thanh toán"

**Role:** Kế toán
**Mục tiêu:** Theo dõi và ghi nhận thanh toán theo tháng.

**Steps:**

1. Login → `/thanh-toan`
2. Xem group theo tháng → baseline: **30 payment trong T2, 1 trong T4**
3. Filter status `PENDING`
4. Chọn 1 payment → click icon "Đã thanh toán"
5. Nhập ngày thanh toán thực tế = hôm nay
6. Payment chuyển sang status `PAID`, hiện ngày trả
7. Filter `PAID` → payment vừa cập nhật hiện ra
8. Tổng giá trị paid trong tháng cập nhật

**Record issue:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## 🎬 Scenario 6 — "Cross-check dữ liệu: HĐ của Hùng Nguyên"

**Role:** Ban kiểm soát
**Mục tiêu:** Đối chiếu dữ liệu giữa các module về cùng 1 NCC.

**Steps:**

1. `/vendors` → search "Hùng Nguyên" → click row → note **Tổng giá trị** (baseline 22,9 tỷ)
2. `/hop-dong` → filter vendor = "Hùng Nguyên" → tính tổng cột `totalNoVAT`
3. So sánh 2 con số → **PHẢI MATCH**
4. `/warehouse` → search "Hùng Nguyên" → đếm số lô đã về
5. `/thanh-toan` → filter supplier "Hùng Nguyên" → tổng giá trị đã lập kế hoạch thanh toán

**Kết quả kỳ vọng:**

- Số liệu giữa `/vendors` và `/hop-dong` khớp chính xác
- Không có HĐ "ma" (xuất hiện ở module này nhưng không có ở module kia)

**Record issue:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## 🎬 Scenario 7 — "Đổi mật khẩu + kiểm tra security"

**Role:** Mọi user
**Mục tiêu:** Kiểm tra luồng đổi mật khẩu và rate limit.

**Steps:**

1. Login → `/settings`
2. Xem thông tin user (name + role)
3. Nhập mật khẩu hiện tại + mật khẩu mới (ít nhất 12 ký tự, có chữ hoa + số + ký tự đặc biệt)
4. Xem strength meter → phải hiện "Mạnh" hoặc "Rất mạnh"
5. Xác nhận mật khẩu không khớp → báo lỗi
6. Xác nhận đúng → bấm "Đổi mật khẩu"
7. **Auto logout** sau 1.5 giây → redirect `/login`
8. Đăng nhập mật khẩu CŨ → **phải bị từ chối**
9. Đăng nhập mật khẩu MỚI → thành công
10. Logout, thử sai password 6 lần liên tiếp:
    - Lần 1–5: "Sai thông tin đăng nhập" (HTTP 401)
    - **Lần 6**: "Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau 15 phút" (HTTP 429)

**Record issue:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## 📝 Tổng hợp issue sau UAT

| #   | Scenario | Bước | Mô tả issue | Severity | Owner | Status |
| --- | -------- | ---- | ----------- | -------- | ----- | ------ |
| 1   |          |      |             |          |       |        |
| 2   |          |      |             |          |       |        |
| 3   |          |      |             |          |       |        |

---

## ✍️ Feedback tổng quan

**UX tốt:**

1. ─────────
2. ─────────
3. ─────────

**Cần cải thiện:**

1. ─────────
2. ─────────
3. ─────────

**Chức năng còn thiếu (phase 2):**

1. ─────────
2. ─────────
3. ─────────
