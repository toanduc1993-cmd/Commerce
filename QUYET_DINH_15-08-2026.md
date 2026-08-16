# Quyết định ngày 15/08/2026 — anh Hưng chốt 23 mục

> Ghi lại để không phải hỏi lại. Mục nào thực hiện xong thì đánh dấu ✅ và ghi ngày.

## Nhóm 1 — đã đồng ý toàn bộ (1–9)

| # | Việc | Quyết định |
|---|---|---|
| 1 | M-03 · 1b tiêu đề bảng không dính | sửa — tiêu đề dính đỉnh, nút Lưu luôn thấy |
| 2 | M-04 · 1c thanh lọc cuộn mất | sửa — thanh lọc dính đỉnh |
| 3 | M-05 · hai họ trang cuộn hai kiểu | sửa — thống nhất theo kiểu `/mua-hang`; kéo theo 1 và 2 |
| 4 | M-06 · 1b tràn 74px ở màn 1280 | sửa — thu cột cho vừa |
| 5 | M-07 · 1c thẻ xếp một cột | sửa — xếp nhiều cột theo bề ngang |
| 6 | M-08 · nhánh giao diện không chạy được | sửa — nối lại hoặc gỡ; siết mốc nghiệm thu về **0 lỗi** |
| 7 | M-09 · số hiệu bước vênh | dùng **1a / 1b / 1c** ở cả menu lẫn trong trang |
| 8 | Net Quantity + Total Ordered bên Theo dõi | mang sang, **chỉ đọc** |
| 9 | Đường dẫn module mới | `/theo-doi-mua-hang`; `/mua-hang` giữ cho Yêu cầu mua |

## Nhóm 2 — đã chọn phương án

| # | Việc | Quyết định |
|---|---|---|
| 10 | M-01 · hai trang phụ mất thanh menu | **(a)** vá thanh menu vào 2 trang, không đụng khung chung |
| 11 | M-02 · lối vào 1b/1c | **(a)** nút trên **từng dòng vật tư** |
| 12 | Cột tồn kho + khối lượng phải mua | **(a)** Theo dõi hiển thị **chỉ đọc**, sửa ở 1b |
| 13 | REV bên Theo dõi | **(a)** không mang dãy cột REV; thay bằng **một cột "ký theo REV mấy"** |
| 14 | Chỗ đặt module Theo dõi trên menu | **(a)** mục riêng dưới dãy quy trình, **không đánh số** |
| 15 | Ba module 4·5·6 chưa nhận tham số | **(a)** thêm ngay, để nối được đủ |

## Nhóm 3 — dữ kiện nghiệp vụ

| # | Câu hỏi | Anh Hưng trả lời |
|---|---|---|
| 16 | Số lần REV | **linh động theo từng dự án, co duỗi được** — không phải con số cố định |
| 17 | `PKG-009/063/068/075` | **là dự án thật** → cần bổ sung tên vào danh mục |
| 18 | Hai dự án rỗng | **giữ lại** (hiện đang bị ẩn — phải khôi phục) |
| 19 | 33 cột chưa có nút lọc | **có, cần thêm** |
| 20 | Đ-11 bảng lệch cột | đã soát và hiệu chỉnh xong — chỉ cần kiểm lại lần nữa |
| 21 | Vùng chế tạo | **tuỳ theo dự án**; chứa thông tin từng **cấu kiện cần chế tạo**, **khối lượng**, **thời điểm cần vật tư** |
| 22 | Định nghĩa vùng chế tạo | Vùng chế tạo chứa **chủng loại vật tư tương ứng với PR**, phân theo **từng hạng mục chế tạo**; mỗi hạng mục có **khối lượng · số lượng · thời điểm cần vật tư** |
| 23 | Tiến độ theo vùng chế tạo | đo bằng **NGÀY** |

## Hai chỉ đạo kèm theo

- **Vùng chế tạo** trở thành **mục con của Yêu cầu mua hàng (1a)**, không phải của Theo dõi mua hàng.
  Sau này cập nhật tiến độ theo từng vùng.
- **Tách module thì sửa từ backend**, không chỉ cắt giao diện.
