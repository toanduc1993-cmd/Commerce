# UAT Checklist — IBS Procurement System

**Ngày test:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
**Môi trường:** ☐ Local ☐ Staging ☐ Production
**Tester:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ (Phòng TM / Kỹ thuật)
**Build:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ (commit hash)

---

## Baseline dữ liệu hiện có (snapshot để so sánh)

| Mục            | Số lượng | Giá trị           |
| -------------- | -------- | ----------------- |
| Projects       | 5        | —                 |
| PRs            | 5        | 1.351 items       |
| Contracts      | 245 HĐ   | 76,9 tỷ VND       |
| Contract items | 1.578    | (218 DN / 27 NK)  |
| Bid analyses   | 81       | 172 vendor offers |
| Vendor master  | 124      | —                 |
| Payments       | 31       | —                 |
| Arrivals       | 97       | 62 handover SX    |
| Material cat.  | ~1.351   | VPK/VTC/VDK       |

Top vendors theo giá trị HĐ:

1. **Hùng Nguyên** — 22,9 tỷ
2. **VSAN** — 9,2 tỷ
3. **Ngọc Hiếu** — 7,98 tỷ
4. **MRO** — 5,88 tỷ

---

## 🔐 PHẦN A — Đăng nhập & bảo mật

| #   | Kịch bản                                                 | Kết quả kỳ vọng                                          | Pass |
| --- | -------------------------------------------------------- | -------------------------------------------------------- | ---- |
| A1  | Mở URL, tự redirect về `/login`                          | Hiện form đăng nhập                                      | ☐    |
| A2  | Đăng nhập với tài khoản đúng                             | Redirect về `/dashboard`                                 | ☐    |
| A3  | Đăng nhập với mật khẩu sai (1 lần)                       | Báo "Sai thông tin đăng nhập"                            | ☐    |
| A4  | Sai password 6 lần liên tiếp                             | Lần thứ 6 bị khoá: "Quá nhiều lần đăng nhập sai…"        | ☐    |
| A5  | Vào `/settings` → đổi password                           | Strength meter hiển thị, đổi xong bị đăng xuất           | ☐    |
| A6  | Đăng nhập với password cũ sau khi đổi                    | Bị từ chối                                               | ☐    |
| A7  | Đăng nhập với password mới                               | Thành công                                               | ☐    |
| A8  | Click "Đăng Xuất" ở Sidebar                              | Quay về `/login`                                         | ☐    |
| A9  | Truy cập thẳng `/vendors` khi chưa login                 | Redirect về `/login`                                     | ☐    |

---

## 📊 PHẦN B — Dashboard

| #   | Kịch bản                                | Kết quả kỳ vọng                                    | Pass |
| --- | --------------------------------------- | -------------------------------------------------- | ---- |
| B1  | Load `/dashboard`                       | Các KPI card hiện số: 5 projects, 1.351 items…    | ☐    |
| B2  | Hiển thị Top Vendors                    | Hùng Nguyên đứng đầu ~22,9 tỷ                      | ☐    |
| B3  | Group breakdown (VPK/VTC/VDK)           | Có bảng phân loại theo nhóm vật tư                 | ☐    |
| B4  | Tổng giá trị hợp đồng                   | 76,9 tỷ VND (hoặc số hiện tại)                     | ☐    |

---

## 📁 PHẦN C — Dự án & PR

| #   | Kịch bản                                            | Kết quả kỳ vọng                                | Pass |
| --- | --------------------------------------------------- | ---------------------------------------------- | ---- |
| C1  | Vào `/projects`, thấy 5 dự án                       | List hiển thị đầy đủ code/name                 | ☐    |
| C2  | Click 1 dự án → xem chi tiết PR                     | Bảng PR detail với số items                    | ☐    |

---

## 📋 PHẦN D — Theo dõi mua hàng (Master Tracking)

| #   | Kịch bản                                                      | Kết quả kỳ vọng                                        | Pass |
| --- | ------------------------------------------------------------- | ------------------------------------------------------ | ---- |
| D1  | Vào `/mua-hang`                                               | Bảng ~119 cột hiển thị                                 | ☐    |
| D2  | Scroll ngang xem các nhóm cột: PR / Gia công / HĐ / Thanh toán | Header sticky, scroll mượt                             | ☐    |
| D3  | Filter theo project (chọn 1 project)                          | Chỉ hiện items thuộc project đó                         | ☐    |
| D4  | Search theo mã vật tư                                         | Highlight/lọc đúng                                      | ☐    |
| D5  | Upload file "Theo dõi dự án" mới                              | Hiện thông báo số items matched/created/updated        | ☐    |

---

## 💰 PHẦN E — Báo giá (Module 2)

| #   | Kịch bản                                | Kết quả kỳ vọng                                | Pass |
| --- | --------------------------------------- | ---------------------------------------------- | ---- |
| E1  | Vào `/bao-gia`                          | List 81 bid analyses                            | ☐    |
| E2  | Click 1 bid → xem danh sách vendor offer | Bảng items × vendors với giá                   | ☐    |
| E3  | Upload file BID ANALYSIS mới            | Thông báo số bids/items/offers parsed          | ☐    |

---

## 🔀 PHẦN F — So sánh báo giá (Module 3)

| #   | Kịch bản                                         | Kết quả kỳ vọng                                          | Pass |
| --- | ------------------------------------------------ | -------------------------------------------------------- | ---- |
| F1  | Vào `/so-sanh-bao-gia`                            | Sidebar list bids + vendor cards                          | ☐    |
| F2  | Click 1 bid → so sánh vendors                     | Matrix giá, highlight low-price                           | ☐    |
| F3  | Click "Chọn NCC" cho 1 vendor                    | Bid chuyển status SELECTED, vendor đánh dấu winner       | ☐    |

---

## 📝 PHẦN G — Hợp đồng (Module 4)

| #   | Kịch bản                                  | Kết quả kỳ vọng                                           | Pass |
| --- | ----------------------------------------- | --------------------------------------------------------- | ---- |
| G1  | Vào `/hop-dong`                            | List 245 contract groups                                   | ☐    |
| G2  | Click 1 HĐ → expand xem line items        | Hiển thị các item của HĐ đó                                | ☐    |
| G3  | Filter theo IMPORT vs DOMESTIC            | 27 IMPORT / 218 DOMESTIC                                    | ☐    |
| G4  | Filter theo vendor "Hùng Nguyên"          | Chỉ hiện HĐ của Hùng Nguyên                                | ☐    |
| G5  | Tổng giá trị cột totalNoVAT               | Trùng với Dashboard (76,9 tỷ)                              | ☐    |

---

## 💵 PHẦN H — Thanh toán (Module 5)

| #   | Kịch bản                                   | Kết quả kỳ vọng                                  | Pass |
| --- | ------------------------------------------ | ------------------------------------------------ | ---- |
| H1  | Vào `/thanh-toan`                           | List 31 payment schedules                        | ☐    |
| H2  | Group theo tháng                            | Hiển thị month bucket                            | ☐    |
| H3  | Click 1 payment → đánh dấu "Đã thanh toán" | Status chuyển PAID, ngày trả hiện ra             | ☐    |
| H4  | Filter theo status PENDING/PAID             | Lọc chính xác                                     | ☐    |
| H5  | Upload file "Kế hoạch thanh toán" mới      | Thông báo số records parsed                      | ☐    |

---

## 🏭 PHẦN I — Nhà cung cấp (Module 6) ★ NEW

| #   | Kịch bản                                         | Kết quả kỳ vọng                                                   | Pass |
| --- | ------------------------------------------------ | ----------------------------------------------------------------- | ---- |
| I1  | Vào `/vendors`                                    | 124 NCC list                                                       | ☐    |
| I2  | KPI card "Tổng NCC" hiển thị đúng số             | 124 hoặc số hiện tại                                               | ☐    |
| I3  | Filter "Nhập khẩu"                                | Chỉ NCC IMPORT (VSAN, GNEE, FENGYANG…)                            | ☐    |
| I4  | Search "Hùng Nguyên"                              | Hiện Hùng Nguyên + biến thể                                       | ☐    |
| I5  | Click row → Drawer chi tiết bên phải              | Hiện thông tin + lịch sử hợp đồng (50 HĐ gần nhất)               | ☐    |
| I6  | Bấm "Thêm NCC" → nhập đủ thông tin → Tạo mới      | NCC mới xuất hiện trong list                                      | ☐    |
| I7  | Click edit → đổi số điện thoại → Cập nhật        | Thông tin mới lưu lại                                              | ☐    |
| I8  | Tạo NCC với tên đã tồn tại                        | Báo lỗi "đã tồn tại"                                               | ☐    |
| I9  | Click icon "INACTIVE" → confirm                    | NCC chuyển status INACTIVE, biến khỏi filter default              | ☐    |
| I10 | Filter "Hiện tất cả" → thấy NCC INACTIVE          | INACTIVE rows hiện ra với badge xám                                | ☐    |
| I11 | Click "Seed" (chỉ ADMIN)                           | Báo đã tạo thêm 0 (vì đã seed đầy đủ)                             | ☐    |
| I12 | Click xoá vĩnh viễn → confirm                      | NCC bị xoá hoàn toàn khỏi list                                    | ☐    |

---

## 📦 PHẦN J — Danh mục vật tư

| #   | Kịch bản                                     | Kết quả kỳ vọng                                    | Pass |
| --- | -------------------------------------------- | -------------------------------------------------- | ---- |
| J1  | Vào `/inventory`                              | Catalog ~1.351 mã vật tư, read-only                 | ☐    |
| J2  | Filter nhóm VTC                               | Chỉ hiện VTC (~652 items)                           | ☐    |
| J3  | Search theo profile "H300"                    | Lọc đúng                                            | ☐    |

---

## 📥 PHẦN K — Hàng về & QC (Module 7) ★ NEW

| #   | Kịch bản                                                | Kết quả kỳ vọng                                              | Pass |
| --- | ------------------------------------------------------- | ------------------------------------------------------------ | ---- |
| K1  | Vào `/warehouse`                                         | List 97 HĐ đã có hàng về                                      | ☐    |
| K2  | KPI cards: "Tổng hàng về" / "Bàn giao SX"               | 97 / 62                                                       | ☐    |
| K3  | Filter PENDING QC                                        | 97 (vì chưa có inspection nào)                                | ☐    |
| K4  | Filter IMPORT                                            | Chỉ HĐ nhập khẩu                                              | ☐    |
| K5  | Click row → expand xem chi tiết                          | Hiện project info + bảng biên bản QC (rỗng)                   | ☐    |
| K6  | Click "Thêm QC" → nhập report no + kết quả "Pass"       | Biên bản lưu, status chuyển PASSED                            | ☐    |
| K7  | Click icon engineering → nhập ngày bàn giao SX          | HĐ chuyển cột "Đã bàn giao"                                    | ☐    |
| K8  | Xoá biên bản QC                                          | Biên bản biến mất, status revert                              | ☐    |
| K9  | Click icon "event_available" → đổi ngày hàng về         | Ngày cập nhật                                                 | ☐    |

---

## ⚡ PHẦN L — Performance & UX

| #   | Kịch bản                                        | Kết quả kỳ vọng                                | Pass |
| --- | ----------------------------------------------- | ---------------------------------------------- | ---- |
| L1  | Load `/mua-hang` với 1.351 items               | < 5 giây, scroll mượt không lag                 | ☐    |
| L2  | Upload file Excel 2MB                           | < 30 giây hoàn thành                            | ☐    |
| L3  | Mở 10 tab browser đồng thời                     | Không sập, không chậm                           | ☐    |
| L4  | Sidebar active-link highlight đúng khi navigate | Icon và tên tab active sáng màu đậm             | ☐    |

---

## 🔍 PHẦN M — Cross-validation (đối chiếu Excel gốc)

Chọn 3 HĐ ngẫu nhiên từ file Excel gốc và so với dữ liệu trong hệ thống:

| HĐ gốc (số)   | Vendor        | Giá trị Excel | Giá trị hệ thống | Match? |
| ------------- | ------------- | ------------- | ---------------- | ------ |
| \_\_\_\_\_\_  | \_\_\_\_\_\_  | \_\_\_\_\_\_  | \_\_\_\_\_\_     | ☐      |
| \_\_\_\_\_\_  | \_\_\_\_\_\_  | \_\_\_\_\_\_  | \_\_\_\_\_\_     | ☐      |
| \_\_\_\_\_\_  | \_\_\_\_\_\_  | \_\_\_\_\_\_  | \_\_\_\_\_\_     | ☐      |

Chọn 2 bid analysis từ Excel:

| Subject | Vendor winner | Tổng offer Excel | Tổng offer hệ thống | Match? |
| ------- | ------------- | ---------------- | ------------------- | ------ |
| \_\_\_  | \_\_\_        | \_\_\_           | \_\_\_              | ☐      |
| \_\_\_  | \_\_\_        | \_\_\_           | \_\_\_              | ☐      |

---

## 🐛 Bug log

| #   | Mô tả lỗi | Mức độ (P0/P1/P2) | Người report | Status |
| --- | --------- | ----------------- | ------------ | ------ |
| 1   |           |                   |              |        |
| 2   |           |                   |              |        |

**Mức độ:**

- **P0** (Blocker) — Không go-live được, phải fix ngay
- **P1** (Critical) — Chức năng chính không chạy đúng
- **P2** (Minor) — UI xấu, message lỗi không rõ, nice-to-have

---

## ✅ Kết luận UAT

☐ **PASS** — Sẵn sàng go-live
☐ **PASS with conditions** — Fix P0/P1, sau đó go-live
☐ **FAIL** — Cần fix + test lại trước khi go-live

**Ký xác nhận:**

- Phòng TM: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ Ngày: \_\_\_\_\_\_
- Phòng Kỹ thuật: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ Ngày: \_\_\_\_\_\_
- IT/PM: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ Ngày: \_\_\_\_\_\_
