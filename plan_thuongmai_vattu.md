# Kế hoạch & Chuyên khảo: Nền tảng E-Procurement cho Gia công Cơ khí & Đóng tàu
*(Tài liệu này được định hướng riêng cho Phòng Thương mại vận hành trong doanh nghiệp ETO - Engineer to Order)*

---

## 1. Phân Tích Độ Khó Đặc Thù (Pain-Points)

Gia công cơ khí hạng nặng và Đóng tàu không giống sản xuất hàng loạt. Các lô hàng và vật tư phụ thuộc trực tiếp vào bản vẽ thiết kế (CAD) của từng dự án riêng biệt.
*   **EBOM & MBOM Gap:** Thiết kế bóc tách EBOM (Engineering BOM - Bản vẽ), nhưng Phòng Thương Mại phải mua theo MBOM (Manufacturing BOM - Quy cách cắt/ghép, phôi thép lớn, block).
*   **Long Lead Time Items (Hàng chờ siêu lâu):** Động cơ tàu thủy, bơm tuần hoàn, thép AH36 đóng tàu yêu cầu đặt trước 3-6 tháng trước khi lắp ráp. Phải có module theo dõi Lead Time.
*   **Truy xuất Nguồn gốc (Traceability) Khắt khe:** Chứng chỉ CO/CQ, Mill Test Certificate (Chứng chỉ thép), đăng kiểm (VR, ABS, DNV) là yếu tố sống còn bắt buộc đính kèm linh kiện khi mua. Một con ốc dưới thân tàu cũng phải có chứng chỉ.
*   **Quản lý Hợp đồng Thầu phụ (Subcontractor ETO):** Thuê ngoài gia công từng block tàu, sơn chống rỉ, cần tích hợp với vật tư do chủ đầu tư cấp. 

## 2. Các Module Cốt Lõi (Đề Xuất cho Phòng Thương Mại)

### Module 1: Master Data & Sức mạnh Ingestion (Nhập liệu) 
- Bypass khâu Bóc tách (Nesting) trên hệ thống vì dữ liệu đã do kỹ thuật xuất sẵn.
- Import tự động Dự toán Dự án từ tệp Excel chuẩn hóa.
- Import và ánh xạ (mapping) Yêu cầu Vật tư (PR) từ khối lượng Excel do các phòng ban đệ trình.

### Module 2: Quản lý Hồ sơ Nhà Cung Cấp & Logistic Toàn Cầu
- Phân loại Vendor theo cấp độ chứng nhận (ISO, Đăng kiểm Quốc tế).
- Theo dõi lịch trình tàu biển / Hải quan (In-transit Tracking) cho hàng nhập khẩu.
- Supplier Portal liên kết thẳng với bên Forwarder.

### Module 3: Chấm điểm & Quy trình Phê duyệt Vượt Cấp
- Approval/Bidding Matrix cấu hình linh hoạt (Luật 3 bảng báo giá + Phân tích Total Cost of Ownership - TCO).
- Theo dõi ngân sách (Job Costing) phân bổ cho từng Block hoặc Hệ thống ống (Piping), Hệ thống điện.

## 3. Kiến trúc Công nghệ & Tích hợp ERP
*   **Backend:** Node.js hoặc C# .NET Core (Mạnh về xử lý dữ liệu Hierarchy BOM phức tạp). Database: PostgreSQL (Sử dụng extension Ltree hoặc JSONB để xử lý BOM cây).
*   **Tích hợp (API Gateway):** Kết nối với ERP lõi (SAP/Odoo/IFS) hoặc phần mềm kế toán hiện tại.
*   **Cloud Storage:** Liên kết S3/Cloud lưu trữ Chứng chỉ xuất xứ (CO/CQ, MTR) phục vụ nghiệm thu dự án.

## 4. Lộ trình Triển khai (4 Phase)
1.  **Phase 1 (Core & PR):** Xây dựng CSDL Vật tư chuẩn (Hàng Đóng tàu / Cơ khí) & Luồng Yêu cầu mua hàng (PR) từ BOM.
2.  **Phase 2 (Sourcing):** Đấu thầu ảo (Bidding Portal), Vendor Management.
3.  **Phase 3 (AP & QC):** Quản lý nghiệm thu CO/CQ, Chứng chỉ đăng kiểm, Nhập kho. 
4.  **Phase 4 (Traceability):** Số hóa tài liệu theo tàu/dự án chuẩn bị báo cáo kiểm toán ngân sách.
