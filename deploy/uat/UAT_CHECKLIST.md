# UAT Checklist — IBS Procurement System

> **Cập nhật 17/08/2026** — bản gốc viết ngày 29/05 và chưa sửa lần nào. Từ đó hệ thống đã lên
> **18 màn hình / 92 route API**, trong đó **8 màn hình chưa hề có trong bộ kiểm này**. Phần A→I
> là nội dung cũ (giữ nguyên, cần rà lại); phần **J→O là bổ sung 17/08** cho đợt bàn giao
> 20 người dùng qua LAN. Tài liệu cũ còn trỏ tới `/so-sanh-bao-gia` — đường dẫn này đã bị gộp
> vào `/duyet` và không còn tồn tại.

**Ngày test:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
**Môi trường:** ☐ Local ☐ Staging ☐ Production
**Tester:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ (Phòng TM / Kỹ thuật)
**Build:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ (commit hash)

---

## Số liệu nền — đo lại ngày 17/08/2026

> Bảng cũ (5 dự án · 245 HĐ · 124 NCC) là số liệu tháng 5, đã lạc hậu hoàn toàn. Số dưới đây
> lấy trực tiếp từ cơ sở dữ liệu ngày 17/08/2026.

| Mục | Số lượng | Ghi chú |
| --- | --- | --- |
| Dự án | 56 | |
| Yêu cầu mua (PR) | 52 | 1.979 dòng |
| Chi tiết hợp đồng | 3.465 | ~219,6 tỷ VND |
| Đợt báo giá | 251 | 2.188 dòng · 1.559 ô báo giá |
| Nhà cung cấp | 189 | |
| Danh mục vật tư | 4.440 | |
| Lịch thanh toán | 31 | |
| Hạng mục chế tạo | 17 | |
| Nhật ký kiểm toán | 270 | |
| **Đơn đặt hàng** | **0** | ⚠️ chưa từng dùng thật |
| **Hàng về** | **0** | ⚠️ chưa từng dùng thật |
| **Tồn kho** | **0** | ⚠️ chưa từng dùng thật |
| **Phân bổ chế tạo** | **0** | ⚠️ chưa từng dùng thật |
| **Người dùng** | **1** (ADMIN) | ⚠️ cần 20 tài khoản |

Bốn bảng rỗng ở trên là vùng rủi ro cao nhất: màn hình tương ứng chưa bao giờ chạy với dữ liệu
thật, nên lỗi ở đó sẽ chỉ lộ ra khi người dùng bắt đầu nhập.

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

---

# BỔ SUNG 17/08/2026 — cho đợt bàn giao 20 người dùng qua LAN

## ⛔ PHẦN J — VIỆC CHẶN BÀN GIAO (làm trước, chưa xong thì chưa kiểm tiếp)

| # | Việc | Hiện trạng đo được 17/08 | Xong |
| --- | --- | --- | --- |
| J1 | **Phân quyền theo vai trò gần như không có** | Có 92 route, **chỉ 12 route chặn theo vai trò (13%)**. **41 route GHI dữ liệu không chặn gì** — bất kỳ ai đăng nhập đều gọi được, gồm `POST /bid-analyses/:id/create-po` (tạo đơn hàng thật), `DELETE /bid-analyses/:id` (xoá đợt báo giá), `POST /bid-analyses/:id/select-vendor`, `POST /prs/import`. Với 20 người khác bộ phận thì một nhân viên kho có thể duyệt nhà cung cấp và tạo đơn hàng hàng tỷ đồng. | ☐ |
| J2 | **Chưa có 20 tài khoản** | CSDL mới có 1 ADMIN. Có sẵn `POST /api/v1/admin/users` (chỉ ADMIN) nhưng **không có màn hình quản lý người dùng** — tạo xong ai sửa, ai khoá, ai đặt lại mật khẩu? | ☐ |
| J3 | **Chế độ chạy + HTTPS** | Nếu đặt `NODE_ENV=production` mà chạy HTTP trên LAN thì cookie đổi thành `__Host-ibshi_csrf` kèm `Secure` (`csrfProtection.js:25-31`) — tiền tố `__Host-` bắt buộc HTTPS, trình duyệt sẽ không lưu và **toàn bộ thao tác ghi trả 403**, đúng lỗi ngày 14/08 nhưng nặng hơn. Có sẵn `deploy/nginx/` nhưng thư mục `certs/` rỗng. | ☐ |
| J4 | **IP LAN cấp động** | `.env.local` ghi rõ IP `192.168.0.37` đã chết vì DHCP đổi sang `.39`. Một mình thì sửa lại là xong; 20 người thì cả hệ thống đứng. Cần IP tĩnh hoặc tên máy. | ☐ |
| J5 | **Mật khẩu CSDL công khai trên GitHub** | Khoản C16 hoãn có chủ ý khi chỉ một người dùng. Còn hoãn được với 20 người trên LAN không? | ☐ |
| J6 | **Sao lưu tự động chưa kiểm chứng** | `deploy/launchd/com.ibshi.vattu.backuppg.plist` có tồn tại, nhưng job launchd của dự án này từng lỗi quyền từ 24/07 — phải chứng minh nó chạy VÀ phục hồi được. | ☐ |

## 🆕 PHẦN K — 8 màn hình chưa có trong bộ kiểm cũ

| # | Màn hình | Kịch bản tối thiểu | Kết quả kỳ vọng | Pass |
| --- | --- | --- | --- | --- |
| K1 | `/duyet` | Mở tab So sánh báo giá một gói nhiều NCC | Mỗi cột hiện giá đúng của NCC đó; ô rẻ nhất tô vàng; cột "Chênh" ra `+x%` | ☐ |
| K2 | `/duyet` | Gói trộn VND/USD | Hiện dải cảnh báo trộn tiền; **mỗi loại tiền có dấu "rẻ nhất" riêng** | ☐ |
| K3 | `/duyet` | Duyệt một dòng có đơn giá 0 rồi bấm Tạo PO | Bị chặn, khung đỏ ghi `Đơn giá = 0 (phạm vi "X" — NCC không chào)`, không sinh đơn hàng | ☐ |
| K4 | `/duyet` | Đổi lần lượt 5 chế độ chọn thầu | Cả 5 đều mở được khung riêng, không có lỗi 500 | ☐ |
| K5 | `/theo-doi-mua-hang` | Mở danh sách, lọc, mở chi tiết | Không trang trắng, số khớp `/mua-hang` | ☐ |
| K6 | `/hang-muc-che-tao` | Xem 17 hạng mục của một dự án | Hiện đủ, sửa được | ☐ |
| K7 | `/phan-bo-che-tao` | Phân bổ một dòng PR vào hạng mục | ⚠️ Bảng đang **rỗng hoàn toàn** — đây là lần chạy thật đầu tiên | ☐ |
| K8 | `/kiem-tra-ton-kho` | Nhập tồn kho từ Excel | Nhập xong hiện bảng kết quả (khối "Nhập tồn kho thành công" trước đây là mã chết, tsc đã sạch — kiểm lại bằng mắt) | ☐ |
| K9 | `/lam-ro-ky-thuat` | Thêm một trao đổi kỹ thuật | Ghi được, hiện đúng vai người viết | ☐ |
| K10 | `/lich-su-mua-hang` | Tra cứu lịch sử một vật tư | Ra kết quả, không lỗi | ☐ |
| K11 | `/alerts` | Mở, đánh dấu đã xử lý một cảnh báo | Trạng thái đổi và giữ sau khi tải lại | ☐ |
| K12 | `/warehouse`, `/inventory` | Ghi nhận một lô hàng về | ⚠️ Hai bảng **rỗng hoàn toàn** — lần chạy thật đầu tiên | ☐ |

## 🧑‍🤝‍🧑 PHẦN L — Ma trận vai trò (bắt buộc, 6 vai trò)

Mỗi phân hệ kiểm **hai chiều**: một vai trò được phép (thành công) và một vai trò không được phép
(phải bị chặn **và** giao diện không hiện nút).

| # | Vai trò | Việc thử | Kỳ vọng | Pass |
| --- | --- | --- | --- | --- |
| L1 | WAREHOUSE | Gọi `POST /bid-analyses/:id/create-po` | **Phải bị từ chối** — hiện tại KHÔNG chặn (xem J1) | ☐ |
| L2 | QC | Gọi `DELETE /bid-analyses/:id` | **Phải bị từ chối** — hiện tại KHÔNG chặn | ☐ |
| L3 | KY_THUAT | Duyệt NCC cho một dòng | **Phải bị từ chối** — hiện tại KHÔNG chặn | ☐ |
| L4 | MUA_HANG | Duyệt NCC cho một dòng | Thành công | ☐ |
| L5 | BOD | `POST /bids/:bidId/select-winner` | Thành công (route này CÓ chặn) | ☐ |
| L6 | QC | `POST /receipts/qc-confirm` | Thành công (route này CÓ chặn) | ☐ |
| L7 | Mọi vai trò | Đăng nhập, xem `/dashboard` | Thành công | ☐ |
| L8 | Không phải ADMIN | `POST /admin/users` | Bị từ chối 403 | ☐ |

## 🌐 PHẦN M — Ma trận trình duyệt (bắt buộc cả hai)

Lý do: ngày 14/08 phát hiện cookie CSRF sai chuẩn làm **mọi thao tác ghi trên Chrome trả 403**
trong khi **Safari vẫn chạy bình thường** — ẩn suốt 2,5 tháng vì chỉ kiểm bằng một trình duyệt
(luật R-18). Đã vá và xác nhận trên Chrome ngày 17/08.

| # | Việc | Chrome | Safari | Ghi chú |
| --- | --- | --- | --- | --- |
| M1 | Đăng nhập | ☐ | ☐ | |
| M2 | Duyệt NCC một dòng (ghi dữ liệu) | ☐ | ☐ | phải 200, không 403 |
| M3 | Đổi chế độ chọn thầu | ☐ | ☐ | |
| M4 | Nhập Excel | ☐ | ☐ | |
| M5 | Tạo đơn hàng | ☐ | ☐ | |
| M6 | Đổi mật khẩu | ☐ | ☐ | |

## 📡 PHẦN N — Chạy trên LAN, 20 người

| # | Kịch bản | Kỳ vọng | Pass |
| --- | --- | --- | --- |
| N1 | Máy khác mở `http://<IP hoặc tên máy>:3000` | Vào được trang đăng nhập | ☐ |
| N2 | Đăng nhập từ máy khác | Thành công, không lỗi CORS | ☐ |
| N3 | Ghi dữ liệu từ máy khác | 200, không 403 | ☐ |
| N4 | **12 người cùng kiểm đồng thời, toàn bộ tính năng** | Không ai bị chặn nhầm bởi giới hạn số lần gọi; không trang trắng; không lỗi 500 | ☐ |
| N4a | 2 người cùng mở một gói, cả hai cùng duyệt một dòng | Người sau phải được báo "dữ liệu đã thay đổi", **không ghi đè im lặng** (xem C-04) | ☐ |
| N4b | 2 người bấm "Tạo PO" cùng lúc trên hai gói khác nhau | Cả hai thành công, hai mã đơn hàng khác nhau, **không ai nhận lỗi 500** (xem BG-03) | ☐ |
| N4c | 12 người cùng nhập Excel trong 10 phút | Không ai chạm trần giới hạn tải file 20 lần/10 phút (xem TB-04) | ☐ |
| N5 | Khởi động lại máy chủ | Người dùng vẫn đăng nhập được, không phải xoá bộ nhớ đệm | ☐ |
| N6 | Đổi IP (mô phỏng DHCP cấp lại) | Có phương án — tên máy hoặc IP tĩnh | ☐ |

## 🧹 PHẦN O — Sau khi làm sạch dữ liệu

Chạy **sau** khi xoá dữ liệu giao dịch. Hệ thống rỗng dễ lộ lỗi mà dữ liệu đầy che mất.

| # | Kịch bản | Kỳ vọng | Pass |
| --- | --- | --- | --- |
| O1 | Đã sao lưu ra file **và thử phục hồi thành công** trước khi xoá | Bắt buộc — chưa chứng minh lùi được thì chưa được xoá | ☐ |
| O2 | Mở cả 18 màn hình khi chưa có dữ liệu | Không trang trắng, không lỗi chia cho 0, có dòng "chưa có dữ liệu" | ☐ |
| O3 | `/dashboard` khi mọi bảng rỗng | Các ô chỉ số hiện 0, không hiện `NaN` hay `undefined` | ☐ |
| O4 | Tạo mới một dự án → PR → báo giá → duyệt → đơn hàng | Đi trọn luồng trên dữ liệu sạch | ☐ |
| O5 | Dữ liệu chủ còn nguyên | Vật tư, nhà cung cấp, dự án giữ lại theo thoả thuận | ☐ |
